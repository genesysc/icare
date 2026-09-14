-- =============================================================================
-- Messages (build spec §4) — direct 1:1 messaging between candidates, gated
-- to accepted connections only. That gate is enforced once, at conversation
-- creation (get_or_create_conversation), not re-checked per message — a
-- connection later being removed doesn't retroactively hide an existing
-- thread, matching how nothing else in this schema unwinds past access when
-- a connection ends.
--
-- No client insert/update policy on conversations at all — the only way one
-- is ever created is the security-definer RPC below, so the accepted-
-- connection requirement can't be bypassed by inserting directly.
--
-- candidate_a_id/candidate_b_id are stored in a canonical (lower-uuid-first)
-- order so a unique constraint can guarantee at most one conversation per
-- pair, without needing a functional index.
-- =============================================================================

create table conversations (
  id             uuid primary key default gen_random_uuid(),
  candidate_a_id uuid not null references candidates(id) on delete cascade,
  candidate_b_id uuid not null references candidates(id) on delete cascade,
  created_at     timestamptz not null default now(),
  check (candidate_a_id < candidate_b_id),
  unique (candidate_a_id, candidate_b_id)
);

alter table conversations enable row level security;

create policy conversations_parties_read on conversations
  for select using (candidate_a_id = auth.uid() or candidate_b_id = auth.uid());

create table messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id       uuid not null references candidates(id) on delete cascade,
  body            text not null check (char_length(body) between 1 and 4000),
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);

create index on messages (conversation_id, created_at);

alter table messages enable row level security;

create policy messages_parties_read on messages
  for select using (
    exists (
      select 1 from conversations conv
       where conv.id = conversation_id
         and (conv.candidate_a_id = auth.uid() or conv.candidate_b_id = auth.uid())
    )
  );

create policy messages_sender_insert on messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversations conv
       where conv.id = conversation_id
         and (conv.candidate_a_id = auth.uid() or conv.candidate_b_id = auth.uid())
    )
  );

-- Marking a message read: either party can update read_at on a message in
-- their own conversation (the app only ever sets read_at, but RLS here
-- doesn't restrict to that column specifically — consistent with how this
-- codebase relies on the app layer for column-level intent elsewhere, e.g.
-- candidates.ts's PATCH routes).
create policy messages_parties_update on messages
  for update using (
    exists (
      select 1 from conversations conv
       where conv.id = conversation_id
         and (conv.candidate_a_id = auth.uid() or conv.candidate_b_id = auth.uid())
    )
  ) with check (
    exists (
      select 1 from conversations conv
       where conv.id = conversation_id
         and (conv.candidate_a_id = auth.uid() or conv.candidate_b_id = auth.uid())
    )
  );

create function get_or_create_conversation(p_other_candidate_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_lo uuid;
  v_hi uuid;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not signed in';
  end if;
  if p_other_candidate_id = v_me then
    raise exception 'Cannot start a conversation with yourself';
  end if;

  if not exists (
    select 1 from connections conn
     where conn.status = 'accepted'
       and (
         (conn.requester_id = v_me and conn.addressee_id = p_other_candidate_id)
         or (conn.addressee_id = v_me and conn.requester_id = p_other_candidate_id)
       )
  ) then
    raise exception 'Messaging is only available between accepted connections';
  end if;

  if v_me < p_other_candidate_id then
    v_lo := v_me; v_hi := p_other_candidate_id;
  else
    v_lo := p_other_candidate_id; v_hi := v_me;
  end if;

  insert into conversations (candidate_a_id, candidate_b_id)
  values (v_lo, v_hi)
  on conflict (candidate_a_id, candidate_b_id) do nothing;

  select id into v_id from conversations where candidate_a_id = v_lo and candidate_b_id = v_hi;
  return v_id;
end;
$$;

revoke execute on function get_or_create_conversation(uuid) from anon;
