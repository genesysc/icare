-- =============================================================================
-- Sprint 14 follow-up — shortlists' uniqueness was (employer_id, candidate_id)
-- from 0001_init (inline) and re-declared in 0016 (shortlists_employer_
-- candidate_unique) — both predate the jobs module and only ever
-- contemplated one pipeline per employer/candidate pair, full stop.
--
-- Workflow handover §3: "Pipelines are scoped to jobs, not companies...
-- the same candidate can legitimately sit in more than one pipeline at once
-- for the same company if they're a genuine fit for two different open
-- roles." That's impossible under the old constraint — a second send_invite
-- for the same candidate at the same employer would violate it outright,
-- even for a completely different job_id.
--
-- Replaced with a single unique constraint on (employer_id, candidate_id,
-- job_id). Rows predating the jobs module have job_id null; Postgres
-- treats each null as distinct for uniqueness purposes, so this is safe
-- even though it wasn't a concern here (0 rows in shortlists throughout
-- this migration).
-- =============================================================================

alter table shortlists drop constraint shortlists_employer_candidate_unique;
alter table shortlists drop constraint shortlists_employer_id_candidate_id_key;

alter table shortlists add constraint shortlists_employer_candidate_job_unique
  unique (employer_id, candidate_id, job_id);
