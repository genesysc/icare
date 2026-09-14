-- =============================================================================
-- Extends the peer-facing views (0026 candidate_peer_feed, 0026
-- candidate_discover) with what Network/Rounds/Profile need to render:
--
--  - identity_verified: "has identity/right-to-work/DBS documents on file",
--    per spec §5 — deliberately NOT wired to dbs_records.on_update_service
--    (that's DBS *confirmation* state, a different fact the spec says must
--    stay separate). A candidate counts as identity-verified once
--    right_to_work is actually set (not the 'not_stated' default) and a DBS
--    certificate number is on file.
--  - current_job_title/current_employer: same LATERAL-join-to-
--    employment_history pattern candidate_search (0013) already uses.
--  - reaction_count/my_reacted/comment_count on the feed, so Rounds doesn't
--    need N extra requests per post.
--  - connection_status/connection_requester_id on Discover, so Network can
--    render Connect vs. "Request sent" vs. Accept/Decline correctly.
--
-- Also fixes two real gaps found while wiring this up (both in views this
-- migration already has to touch, not left for a separate pass):
--  - candidate_discover had no `c.id <> auth.uid()` guard, so a candidate's
--    own profile could appear in their own "People you may know" list.
--  - connection_status excludes already-accepted connections from Discover
--    (they belong to the Network "My connections" list, not "people you
--    may know").
-- =============================================================================

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
  (c.right_to_work <> 'not_stated' and dbs.certificate_number is not null) as identity_verified,
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
  ) as connection_requester_id
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

-- My accepted connections, with the other party's directory-level info —
-- Network's "Connections" list.
create view my_connections as
select
  conn.id as connection_id,
  case when conn.requester_id = auth.uid() then conn.addressee_id else conn.requester_id end as candidate_id,
  a.full_name,
  (c.photo_path is not null) as has_photo,
  p.name as primary_profession,
  eh.job_title as current_job_title,
  eh.employer as current_employer,
  (c.right_to_work <> 'not_stated' and dbs.certificate_number is not null) as identity_verified,
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

-- Pending requests I've received — Network's "Requests" list. (Requests I
-- sent are readable straight off connections via connections_parties_read;
-- the client already knows those from the Discover connection_status.)
create view my_pending_requests as
select
  conn.id as connection_id,
  conn.requester_id as candidate_id,
  conn.note,
  conn.created_at,
  a.full_name,
  (c.photo_path is not null) as has_photo,
  p.name as primary_profession,
  eh.job_title as current_job_title,
  eh.employer as current_employer
from connections conn
  join candidates c on c.id = conn.requester_id
  join accounts a on a.id = c.id
  left join candidate_professions cpr on cpr.candidate_id = c.id and cpr.is_primary
  left join professions p on p.id = cpr.profession_id
  left join lateral (
    select eh2.job_title, eh2.employer
      from employment_history eh2
     where eh2.candidate_id = c.id and eh2.is_current
     order by eh2.started_on desc
     limit 1
  ) eh on true
where conn.status = 'pending'
  and conn.addressee_id = auth.uid();

-- Comments on a visible post, with the commenter's directory-level info.
create view post_comments_feed as
select
  pc.id,
  pc.post_id,
  pc.candidate_id,
  pc.body,
  pc.created_at,
  a.full_name,
  (c.photo_path is not null) as has_photo
from post_comments pc
  join candidates c on c.id = pc.candidate_id
  join accounts a on a.id = c.id
  join candidate_posts cp on cp.id = pc.post_id
  join candidates author on author.id = cp.candidate_id
where cp.is_published
  and not cp.is_flagged
  and author.is_published
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

-- Mentions on a post, resolved to directory-level info only — never more
-- than candidate_discover already exposes to any candidate (spec §2: a
-- mention is equivalent to what Network's directory already shows).
create view post_mentions_feed as
select
  pm.post_id,
  pm.mentioned_candidate_id,
  a.full_name,
  p.name as primary_profession,
  (c.photo_path is not null) as has_photo
from post_mentions pm
  join candidates c on c.id = pm.mentioned_candidate_id
  join accounts a on a.id = c.id
  left join candidate_professions cpr on cpr.candidate_id = c.id and cpr.is_primary
  left join professions p on p.id = cpr.profession_id
where c.is_published;

-- Messages inbox — one row per conversation I'm party to, with the other
-- party's info and a last-message preview.
create view conversation_inbox as
select
  conv.id as conversation_id,
  case when conv.candidate_a_id = auth.uid() then conv.candidate_b_id else conv.candidate_a_id end as other_candidate_id,
  a.full_name as other_full_name,
  (c.photo_path is not null) as other_has_photo,
  lm.body as last_message_body,
  lm.created_at as last_message_at,
  lm.sender_id as last_message_sender_id,
  (
    select count(*) from messages m2
     where m2.conversation_id = conv.id and m2.sender_id <> auth.uid() and m2.read_at is null
  ) as unread_count
from conversations conv
  join candidates c on c.id = case when conv.candidate_a_id = auth.uid() then conv.candidate_b_id else conv.candidate_a_id end
  join accounts a on a.id = c.id
  left join lateral (
    select m.body, m.created_at, m.sender_id
      from messages m
     where m.conversation_id = conv.id
     order by m.created_at desc
     limit 1
  ) lm on true
where conv.candidate_a_id = auth.uid() or conv.candidate_b_id = auth.uid();
