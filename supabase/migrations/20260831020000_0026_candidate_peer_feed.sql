-- =============================================================================
-- Sprint 22 — Home feed, jobseeker wireframe screen 02.
--
-- Founder confirmed 2026-08-31: the Home feed should be a real
-- cross-candidate feed, not scoped to just your own content. Checked
-- first whether any path already let one candidate read another's
-- posts — none did. `candidate_posts_self` (migration 0015) only lets a
-- candidate read their own rows; `candidate_post_search` (also 0015) is
-- gated on `is_verified_employer()`, employers only. This migration adds
-- the missing peer-facing path.
--
-- Same restraint as everywhere else in this schema: a candidate's name,
-- photo and contact details are hidden from EMPLOYERS pre-consent
-- (non-negotiable-level, see candidate_search in 0001) — extending that
-- same protection to peer visibility rather than inventing a laxer rule
-- for other candidates. This view exposes exactly the same fields
-- candidate_search already exposes to employers (headline, primary
-- profession, town) plus the post itself — nothing new is disclosed to
-- a wider audience than already sees it, just to a different one.
--
-- Same "security definer view bypasses querying user's RLS" pattern
-- already used by candidate_search/candidate_post_search (flagged by
-- get_advisors as a pre-existing, accepted risk, not introduced here) —
-- access is controlled by the view's own WHERE clause instead:
-- current_role_is('candidate') (0002_auth.sql) gates it to signed-in
-- candidate accounts only, matching how is_verified_employer() gates
-- candidate_post_search to employers.
-- =============================================================================

create view candidate_peer_feed as
select
  cp.id,
  cp.candidate_id,
  cp.title,
  cp.body,
  cp.created_at,
  c.headline,
  c.town,
  p.name as primary_profession
from candidate_posts cp
join candidates c on c.id = cp.candidate_id
left join candidate_professions cpr on cpr.candidate_id = c.id and cpr.is_primary
left join professions p on p.id = cpr.profession_id
where cp.is_published
  and not cp.is_flagged
  and c.is_published
  and public.current_role_is('candidate');

revoke all on candidate_peer_feed from anon;
grant select on candidate_peer_feed to authenticated;
