-- =============================================================================
-- A candidate deciding whether to consent (0017) needs to know WHO
-- shortlisted them — employers had no read policy for candidates at all
-- (only employers_self existed), so a candidate embedding employers(org_name)
-- via PostgREST on their own shortlists rows would just get RLS-filtered
-- nulls. Scoped narrowly: only employers who actually have a shortlists row
-- naming this candidate, nothing broader.
-- =============================================================================

create policy employers_read_by_shortlisted_candidate on employers
  for select using (
    exists (
      select 1 from shortlists s
       where s.employer_id = employers.id
         and s.candidate_id = auth.uid()
    )
  );
