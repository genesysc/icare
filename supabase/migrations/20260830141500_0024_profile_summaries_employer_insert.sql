-- =============================================================================
-- Sprint 15 follow-up — profile_summaries only had a candidate-scoped INSERT
-- policy (the primary generation path: candidates.ts, at consent time).
-- Missed while designing 0023: who_is_summary's fallback path in
-- employer-chat.ts (a pre-Sprint-15 row consented before profile_summaries
-- existed) runs under the EMPLOYER's own RLS-scoped client, not the
-- candidate's, and needs to backfill the frozen snapshot so future calls
-- read it instead of regenerating live every time. Without this, that
-- backfill insert would just silently fail RLS every time — not a crash,
-- but a real "looks like it works, never actually persists" bug.
--
-- Scoped narrowly: an employer can only insert a summary for a pipeline
-- where they're the employer of record AND the candidate has actually
-- consented AND the pipeline isn't closed — the same three conditions
-- who_is_summary itself already checks before calling this, so this policy
-- can't be used to fabricate a summary for a candidate who hasn't
-- consented.
-- =============================================================================

create policy profile_summaries_employer_insert on profile_summaries
  for insert with check (
    employer_id = auth.uid()
    and is_verified_employer()
    and exists (
      select 1 from shortlists s
       where s.id = shortlist_id
         and s.employer_id = auth.uid()
         and s.candidate_consented_at is not null
         and s.closed_at is null
    )
  );
