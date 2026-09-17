-- =============================================================================
-- "View another member's profile" — flagged as an open item in both
-- handover_3.md and the Rounds/Network/Messages/Profile spec ("viewing
-- another member's profile is a different screen, not yet designed").
-- Network and Discover only ever showed a name/headline/town card;
-- there was nowhere to click through to see someone's actual profile.
--
-- Follows the platform's existing, already-decided split:
--   - Identity (name, photo, headline, employer) is free-for-all between
--     candidates (Sprint 24 correction on candidate_discover) — no
--     consent gate on this side of the product, that belongs to the
--     employer side only.
--   - DBS status is peer-hidden, full stop (0041/rounds-network spec
--     "DBS status is no longer shown to peers at all"). Nothing here
--     touches dbs_records or exposes it.
--   - Right-to-work detail and registration numbers are treated the
--     same conservative way even though no doc explicitly bans them
--     peer-side: right_to_work stays off this view entirely (it's only
--     ever been an employer-relevant field, self-view already labels it
--     under "Right to work" for the candidate's own eyes only), and
--     registrations expose the register/regulator name but never the
--     raw reg_number, so a peer can see "NMC Registered" as a
--     credibility signal without being handed a lookup-able number.
--     This is a reasonable default, not a documented decision — flagged
--     for the founder to confirm or override.
--
-- candidates itself has no candidate-peer read policy (only self /
-- verified-employer, see 0002) — same reason candidate_discover and
-- candidate_peer_feed exist as views rather than direct table reads:
-- a view owned by the migration role reads the raw table freely and
-- re-applies its own row filter, same pattern as those two.
-- =============================================================================

create or replace view candidate_peer_profile as
select
  c.id,
  a.full_name,
  (c.photo_path is not null) as has_photo,
  c.headline,
  c.about,
  c.town,
  c.availability,
  p.name as primary_profession,
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
  left join lateral (
    select eh2.job_title, eh2.employer
      from employment_history eh2
     where eh2.candidate_id = c.id and eh2.is_current
     order by eh2.started_on desc
     limit 1
  ) eh on true
where c.is_published
  and current_role_is('candidate'::account_role);

-- Registrations, safe-columns-only for a peer viewer — never reg_number.
-- (registrations itself keeps its existing self/employer-shortlisted
-- policies untouched; this view is the only peer-facing path to it.)
create or replace view candidate_peer_registrations as
select r.id, r.candidate_id, r.register_name, r.regulator, r.expires_on
from registrations r
  join candidates c on c.id = r.candidate_id
where c.is_published
  and current_role_is('candidate'::account_role);

-- Employment history and qualifications have no column as sensitive as a
-- DBS or registration number, so (unlike registrations above) a direct
-- RLS policy is enough — same choice already made for
-- candidate_professions_read_published / candidate_skills_read_published
-- in 0005, just for a candidate viewer instead of a verified employer.
create policy employment_history_read_published_peer on employment_history
  for select using (
    public.current_role_is('candidate')
    and exists (select 1 from candidates c where c.id = employment_history.candidate_id and c.is_published)
  );

create policy qualifications_read_published_peer on qualifications
  for select using (
    public.current_role_is('candidate')
    and exists (select 1 from candidates c where c.id = qualifications.candidate_id and c.is_published)
  );

create policy candidate_professions_read_published_peer on candidate_professions
  for select using (
    public.current_role_is('candidate')
    and exists (select 1 from candidates c where c.id = candidate_professions.candidate_id and c.is_published)
  );

create policy candidate_skills_read_published_peer on candidate_skills
  for select using (
    public.current_role_is('candidate')
    and exists (select 1 from candidates c where c.id = candidate_skills.candidate_id and c.is_published)
  );
