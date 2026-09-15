-- Adds a body preview to 'message' notifications. conversation_inbox
-- (0037) already shows a last-message preview in the Messages list itself
-- — this matches that established convention for the bell dropdown rather
-- than leaving "X sent you a message" with no indication of what it says.
--
-- Stores the specific message_id that triggered the notification (0043's
-- notify_new_message only had conversation_id, which can't identify which
-- message within a thread caused any one notification row) rather than
-- "the conversation's latest message" — the latter would drift to show a
-- LATER message's text next to an EARLIER notification once more messages
-- arrive, which is wrong regardless of read state.

alter table notifications add column message_id bigint references messages(id) on delete cascade;

alter table notifications drop constraint notifications_check;
alter table notifications add constraint notifications_check check (
  (type in ('connection_request', 'connection_accepted')
    and actor_candidate_id is not null and connection_id is not null
    and actor_employer_id is null and conversation_id is null and shortlist_id is null and message_id is null)
  or (type = 'message'
    and actor_candidate_id is not null and conversation_id is not null and message_id is not null
    and actor_employer_id is null and connection_id is null and shortlist_id is null)
  or (type = 'invite'
    and actor_employer_id is not null and shortlist_id is not null
    and actor_candidate_id is null and connection_id is null and conversation_id is null and message_id is null)
);

create or replace function notify_new_message()
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

  insert into notifications (candidate_id, type, actor_candidate_id, conversation_id, message_id)
  values (v_recipient, 'message', new.sender_id, new.conversation_id, new.id);
  return new;
end;
$$;

create or replace view my_notifications as
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
  (s.job_snapshot ->> 'title') as job_title,
  m.body as message_preview
from notifications n
  left join candidates ac on ac.id = n.actor_candidate_id
  left join accounts aa on aa.id = n.actor_candidate_id
  left join employers e on e.id = n.actor_employer_id
  left join shortlists s on s.id = n.shortlist_id
  left join messages m on m.id = n.message_id
where n.candidate_id = auth.uid()
order by n.created_at desc;
