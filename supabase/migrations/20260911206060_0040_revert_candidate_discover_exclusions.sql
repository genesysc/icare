-- URGENT FIX: 0037/0039 added `c.id <> auth.uid()` and a
-- `not exists (accepted connection)` exclusion to candidate_discover.
-- Just discovered this view is shared with an already-LIVE, already-
-- DEPLOYED parallel build on `main` (a different session's Sprints
-- 13-24 work, unknown to this session until now) whose real GET
-- /candidates/network route does
-- `.from("candidate_discover").select("*").in("id", otherIds)` where
-- otherIds includes ACCEPTED connections too, to render their profile
-- card in the live Network page's "Connections" tab. The exclusion
-- added here made every one of those lookups return no row, i.e. it
-- silently broke that tab's connection profile display in production.
-- Reverting the WHERE clause to its original scope (no self/connection
-- exclusion) while keeping the additive columns, which are harmless.
create or replace view candidate_discover as
select
  c.id,
  c.headline,
  c.town,
  c.availability,
  p.name as primary_profession,
  a.full_name,
  (c.photo_path is not null) as has_photo,
  (c.right_to_work <> 'not_stated' and dbs.certificate_number is not null) as identity_verified,
  eh.job_title as current_job_title,
  eh.employer as current_employer,
  (
    select conn.status from connections conn
     where conn.status in ('pending', 'accepted')
       and (
         (conn.requester_id = auth.uid() and conn.addressee_id = c.id)
         or (conn.addressee_id = auth.uid() and conn.requester_id = c.id)
       )
     limit 1
  ) as connection_status,
  (
    select conn.requester_id from connections conn
     where conn.status in ('pending', 'accepted')
       and (
         (conn.requester_id = auth.uid() and conn.addressee_id = c.id)
         or (conn.addressee_id = auth.uid() and conn.requester_id = c.id)
       )
     limit 1
  ) as connection_requester_id,
  (
    select conn.id from connections conn
     where conn.status in ('pending', 'accepted')
       and (
         (conn.requester_id = auth.uid() and conn.addressee_id = c.id)
         or (conn.addressee_id = auth.uid() and conn.requester_id = c.id)
       )
     limit 1
  ) as connection_id
from candidates c
  join accounts a on a.id = c.id
  left join candidate_professions cpr on cpr.candidate_id = c.id and cpr.is_primary
  left join professions p on p.id = cpr.profession_id
  left join dbs_records dbs on dbs.candidate_id = c.id
  left join lateral (
    select eh2.job_title, eh2.employer
      from employment_history eh2
     where eh2.candidate_id = c.id and eh2.is_current
     order by eh2.started_on desc
     limit 1
  ) eh on true
where c.is_published
  and current_role_is('candidate'::account_role);
