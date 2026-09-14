-- Small follow-up to 0037: candidate_discover exposed connection_status but
-- not the connections row id, so a candidate who sent a request had no way
-- to cancel it from the Discover screen (only the underlying DELETE
-- /network/connections/:id route existed with nothing to call it with).
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
  and current_role_is('candidate'::account_role)
  and c.id <> auth.uid()
  and not exists (
    select 1 from connections conn
     where conn.status = 'accepted'
       and (
         (conn.requester_id = auth.uid() and conn.addressee_id = c.id)
         or (conn.addressee_id = auth.uid() and conn.requester_id = c.id)
       )
  );
