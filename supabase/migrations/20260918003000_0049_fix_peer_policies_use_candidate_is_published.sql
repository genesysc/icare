-- Real bug found 2026-09-18 by the founder ("I can only see About and
-- Badges on another member's profile, nothing else") despite the
-- candidate genuinely having employment history, professions, and
-- skills on file.
--
-- Root cause: the four peer-read policies added in 0047
-- (employment_history/qualifications/candidate_professions/
-- candidate_skills) each gated on
--   exists (select 1 from candidates c where c.id = ... and c.is_published)
-- but that subquery itself runs under the VIEWING candidate's own RLS
-- on `candidates` -- which only ever allowed a candidate to read their
-- OWN row, or a verified employer to read published rows (migration
-- 0002). There has never been a policy letting one candidate read
-- ANOTHER candidate's `candidates` row directly, so the subquery saw
-- zero rows for every peer, and the AND condition was always false --
-- silently, since candidates.ts's Promise.all swallows a per-query RLS
-- "no rows" result into an empty array rather than surfacing an error.
--
-- This is the exact same bug class migration 0029 already found and
-- fixed once (connections_requester_insert's exists() check had the
-- identical problem) -- the fix there was a SECURITY DEFINER helper,
-- candidate_is_published(uuid), that checks the one fact needed without
-- granting broader row access. Reusing that existing function here
-- instead of repeating the same mistake with a second inline subquery.
drop policy employment_history_read_published_peer on employment_history;
create policy employment_history_read_published_peer on employment_history
  for select using (
    public.current_role_is('candidate')
    and public.candidate_is_published(employment_history.candidate_id)
  );

drop policy qualifications_read_published_peer on qualifications;
create policy qualifications_read_published_peer on qualifications
  for select using (
    public.current_role_is('candidate')
    and public.candidate_is_published(qualifications.candidate_id)
  );

drop policy candidate_professions_read_published_peer on candidate_professions;
create policy candidate_professions_read_published_peer on candidate_professions
  for select using (
    public.current_role_is('candidate')
    and public.candidate_is_published(candidate_professions.candidate_id)
  );

drop policy candidate_skills_read_published_peer on candidate_skills;
create policy candidate_skills_read_published_peer on candidate_skills
  for select using (
    public.current_role_is('candidate')
    and public.candidate_is_published(candidate_skills.candidate_id)
  );

-- candidate_peer_registrations (0047) is a VIEW, not a table policy --
-- views run with the view owner's privileges by default, so its inline
-- `join candidates c ... where c.is_published` reads the raw table
-- directly and was never affected by this bug. No change needed there.
