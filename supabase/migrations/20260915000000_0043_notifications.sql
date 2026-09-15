-- =============================================================================
-- Notifications — real notification center for four candidate-facing events:
-- connection_request, connection_accepted, message, invite (shortlist/
-- interview). Scoped candidate-side only this pass; the employer-side mirror
-- (candidate responded, pipeline moved) is a same-shape follow-up, not built
-- here.
--
-- Rows are created ONLY by the four SECURITY DEFINER triggers below, never
-- by a direct client insert — same philosophy as get_or_create_conversation
-- (0036): "the only way one is ever created is the [definer] path, so the
-- gate can't be bypassed by inserting directly." No insert/delete policy is
-- granted to authenticated users at all. An update policy IS granted (to
-- mark read_at), matching messages_parties_update's precedent (0036) of
-- trusting the app layer for column-level intent rather than adding a
-- second RPC just to flip one timestamp.
--
-- Exactly one of (actor_candidate_id, actor_employer_id) is set depending
-- on type, and exactly one of (connection_id, conversation_id, shortlist_id)
-- — enforced by the check constraint below rather than trusted to callers,
-- consistent with this schema's general preference for DB-level invariants
-- over application-level discipline (e.g. the six-stage/job-gating checks
-- on shortlists, 0021).
-- =============================================================================

create table notifications (
  id                 uuid primary key default gen_random_uuid(),
  candidate_id       uuid not null references candidates(id) on delete cascade, -- recipient
  type               text not null check (type in ('connection_request', 'connection_accepted', 'message', 'invite')),
  actor_candidate_id uuid references candidates(id) on delete set null,
  actor_employer_id  uuid references employers(id) on delete set null,
  connection_id      uuid references connections(id) on delete cascade,
  conversation_id    uuid references conversations(id) on delete cascade,
  shortlist_id       uuid references shortlists(id) on delete cascade,
  read_at            timestamptz,
  created_at         timestamptz not null default now(),
  check (
    (type in ('connection_request', 'connection_accepted')
      and actor_candidate_id is not null and connection_id is not null
      and actor_employer_id is null and conversation_id is null and shortlist_id is null)
    or (type = 'message'
      and actor_candidate_id is not null and conversation_id is not null
      and actor_employer_id is null and connection_id is null and shortlist_id is null)
    or (type = 'invite'
      and actor_employer_id is not null and shortlist_id is not null
      and actor_candidate_id is null and connection_id is null and conversation_id is null)
  )
);

-- Feed pagination (candidate_id, created_at desc) and the unread-count/dot
-- check (candidate_id, read_at is null) are the two real query shapes —
-- indexed for both rather than one compound index that only serves one.
create index notifications_candidate_idx on notifications (candidate_id, created_at desc);
create index notifications_candidate_unread_idx on notifications (candidate_id) where read_at is null;

alter table notifications enable row level security;

create policy notifications_owner_read on notifications
  for select using (candidate_id = auth.uid());

create policy notifications_owner_update on notifications
  for update using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());

-- =============================================================================
-- my_notifications — joins in live actor/context (name, photo, org, job
-- title) so the API route doesn't need N+1 queries or per-type client
-- branching to render a feed. Same motivation as conversation_inbox/
-- my_connections (0037/0027): join fresh at read time rather than
-- denormalize a name/title copy onto the notification row that would go
-- stale the moment someone renames their profile or an employer edits a
-- job. Explicit `where ... = auth.uid()` even though the base table's own
-- RLS already restricts this — matches every other view in this schema
-- (candidate_discover, my_connections), since a bare view runs as its
-- owner by default and doesn't automatically inherit the caller's RLS
-- context.
-- =============================================================================

create view my_notifications as
select
  n.id,
  n.type,
  n.read_at,
  n.created_at,
  n.connection_id,
  n.conversation_id,
  n.shortlist_id,
  n.actor_candidate_id,
  aa.full_name as actor_name,
  (ac.photo_path is not null) as actor_has_photo,
  n.actor_employer_id,
  e.org_name as actor_org_name,
  (s.job_snapshot ->> 'title') as job_title
from notifications n
  left join candidates ac on ac.id = n.actor_candidate_id
  left join accounts aa on aa.id = n.actor_candidate_id
  left join employers e on e.id = n.actor_employer_id
  left join shortlists s on s.id = n.shortlist_id
where n.candidate_id = auth.uid()
order by n.created_at desc;

-- =============================================================================
-- Triggers. All four SECURITY DEFINER (same pattern as handle_new_user,
-- 0001) so they can write to notifications regardless of whose session
-- performed the underlying insert/update — an employer's own JWT has no
-- reason to be grantable to write into a candidate's notifications table
-- directly, so the definer boundary is what makes this safe rather than
-- an RLS insert policy scoped to "anyone can insert for anyone" (which
-- would be the only alternative). Not revoked from anon/authenticated,
-- matching handle_new_user's own precedent — a trigger function references
-- NEW/OLD, which only exist inside trigger execution, so it cannot be
-- invoked directly via RPC regardless of grants.
-- =============================================================================

create function notify_connection_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (candidate_id, type, actor_candidate_id, connection_id)
  values (new.addressee_id, 'connection_request', new.requester_id, new.id);
  return new;
end;
$$;

create trigger connections_notify_request
after insert on connections
for each row execute function notify_connection_request();

create function notify_connection_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted' and old.status = 'pending' then
    insert into notifications (candidate_id, type, actor_candidate_id, connection_id)
    values (new.requester_id, 'connection_accepted', new.addressee_id, new.id);
  end if;
  return new;
end;
$$;

create trigger connections_notify_accepted
after update on connections
for each row execute function notify_connection_accepted();

-- Fires on every message insert, sender included — the recipient lookup
-- below picks whichever party in the conversation ISN'T the sender, so the
-- sender never gets notified about their own message.
create function notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
begin
  select case when conv.candidate_a_id = new.sender_id then conv.candidate_b_id else conv.candidate_a_id end
    into v_recipient
    from conversations conv
   where conv.id = new.conversation_id;

  insert into notifications (candidate_id, type, actor_candidate_id, conversation_id)
  values (v_recipient, 'message', new.sender_id, new.conversation_id);
  return new;
end;
$$;

create trigger messages_notify_new
after insert on messages
for each row execute function notify_new_message();

-- employer-chat.ts's send_invite upserts with ignoreDuplicates (ON CONFLICT
-- DO NOTHING) so a re-invite for a job the candidate already has doesn't
-- re-fire this — Postgres doesn't run AFTER INSERT triggers for rows
-- skipped by DO NOTHING, so that's enforced for free, not re-checked here.
create function notify_new_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (candidate_id, type, actor_employer_id, shortlist_id)
  values (new.candidate_id, 'invite', new.employer_id, new.id);
  return new;
end;
$$;

create trigger shortlists_notify_invite
after insert on shortlists
for each row execute function notify_new_invite();
