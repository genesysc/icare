-- Identity-verified was fully automatic (right_to_work set + a DBS
-- certificate number on file) — the founder wants it to only flip true
-- once a human has actually checked the certificate number against the
-- government DBS checker (https://secure.crbonline.gov.uk/crsc/check),
-- not just because the candidate typed a number into a field. Adds the
-- same reviewed_at/reviewed_by pattern already used for qualifications
-- and employer_verification_requests elsewhere in this schema — marking
-- a DBS reviewed stays a manual Supabase-dashboard edit for now, same as
-- those, since no admin UI exists anywhere in this app yet.
alter table dbs_records
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references accounts(id);

create or replace view candidate_discover as
select
  c.id,
  c.headline,
  c.town,
  c.availability,
  p.name as primary_profession,
  a.full_name,
  (c.photo_path is not null) as has_photo,
  (c.right_to_work <> 'not_stated' and dbs.certificate_number is not null and dbs.reviewed_at is not null) as identity_verified,
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

create or replace view candidate_peer_feed as
select
  cp.id,
  cp.candidate_id,
  cp.title,
  cp.body,
  cp.created_at,
  c.headline,
  c.town,
  p.name as primary_profession,
  a.full_name,
  (c.photo_path is not null) as has_photo,
  cp.visibility,
  cp.post_type,
  cp.media_path,
  cp.media_filename,
  cp.media_size_bytes,
  cp.media_duration_seconds,
  cp.checkin_venue_name,
  cp.checkin_venue_type,
  cp.checkin_employer_id,
  (c.right_to_work <> 'not_stated' and dbs.certificate_number is not null and dbs.reviewed_at is not null) as identity_verified,
  eh.job_title as current_job_title,
  eh.employer as current_employer,
  (select count(*) from post_reactions pr where pr.post_id = cp.id) as reaction_count,
  exists (select 1 from post_reactions pr2 where pr2.post_id = cp.id and pr2.candidate_id = auth.uid()) as my_reacted,
  (select count(*) from post_comments pc where pc.post_id = cp.id) as comment_count
from candidate_posts cp
  join candidates c on c.id = cp.candidate_id
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
where cp.is_published
  and not cp.is_flagged
  and c.is_published
  and current_role_is('candidate'::account_role)
  and (
    cp.visibility = 'public'
    or exists (
      select 1 from connections conn
       where conn.status = 'accepted'
         and (
           (conn.requester_id = auth.uid() and conn.addressee_id = cp.candidate_id)
           or (conn.addressee_id = auth.uid() and conn.requester_id = cp.candidate_id)
         )
    )
  );

create or replace view my_connections as
select
  conn.id as connection_id,
  case when conn.requester_id = auth.uid() then conn.addressee_id else conn.requester_id end as candidate_id,
  a.full_name,
  (c.photo_path is not null) as has_photo,
  p.name as primary_profession,
  eh.job_title as current_job_title,
  eh.employer as current_employer,
  (c.right_to_work <> 'not_stated' and dbs.certificate_number is not null and dbs.reviewed_at is not null) as identity_verified,
  conn.responded_at as connected_at
from connections conn
  join candidates c on c.id = case when conn.requester_id = auth.uid() then conn.addressee_id else conn.requester_id end
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
where conn.status = 'accepted'
  and (conn.requester_id = auth.uid() or conn.addressee_id = auth.uid());
