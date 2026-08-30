-- =============================================================================
-- Sprint 14 — Bookmark/Send Invite split + six-stage pipeline.
--
-- HANDOVER.md §14 / SPRINTS.md: three independently-uploaded documents
-- (workflow handover, wireframes, Next.js lib/types.ts) agree that shortlist
-- and invite are two different actions, and that the pipeline has six named
-- stages, not five. Founder confirmed 2026-08-30: migrate now.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Bookmarks — private, internal comparison only. No pipeline entry, no
-- candidate visibility, no effect on searchability (workflow handover §2).
-- Deliberately no candidate-read RLS policy anywhere on this table, unlike
-- shortlists' shortlists_candidate_read (0005) — that omission IS the
-- enforcement of "a candidate is never told they've been bookmarked."
-- ---------------------------------------------------------------------------

create table bookmarks (
  id            uuid primary key default gen_random_uuid(),
  employer_id   uuid not null references employers(id) on delete cascade,
  candidate_id  uuid not null references candidates(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (employer_id, candidate_id)
);

alter table bookmarks enable row level security;

create policy bookmarks_employer_self on bookmarks
  for all using (employer_id = auth.uid() and is_verified_employer())
  with check (employer_id = auth.uid() and is_verified_employer());

-- ---------------------------------------------------------------------------
-- shortlists gains job_id + job_snapshot. job_id is nullable at the DB layer
-- (existing rows predate the jobs module) — the hard gate ("Send Invite
-- requires a job") is enforced in src/employer-chat.ts's send_invite tool,
-- not here, same "constrain where a friendly error can be given" pattern as
-- jobs.ts's validateJobInput() duplicating the DB check constraint.
--
-- job_snapshot captures the job's details as shown at the moment the invite
-- was sent (jsonb, same pattern as employer_chat_messages.results_snapshot)
-- so a later edit to the job (pay, hours) can't retroactively change what a
-- candidate is deemed to have consented to — workflow handover §3.
-- ---------------------------------------------------------------------------

alter table shortlists
  add column job_id uuid references jobs(id),
  add column job_snapshot jsonb;

-- Six-stage migration. `shortlists` had 0 rows in production at the time of
-- this migration (confirmed via count immediately before writing it), so
-- the backfill below is precautionary, not a real data-risk mitigation —
-- written correctly regardless, since this repo mirrors migrations as a
-- permanent record and a future re-run against seeded data should still be
-- correct. Mapping is the one the founder confirmed (HANDOVER.md §14):
-- interview -> invited_for_interview, offer -> pending_interview_result,
-- hired -> successful. shortlisted/rejected keep their names; onboarding is
-- new (reachable only from successful, per the six-stage spec).
alter table shortlists drop constraint shortlists_stage_check;

update shortlists set stage = case stage
  when 'interview' then 'invited_for_interview'
  when 'offer' then 'pending_interview_result'
  when 'hired' then 'successful'
  else stage
end;

alter table shortlists add constraint shortlists_stage_check check (
  stage in ('shortlisted', 'invited_for_interview', 'pending_interview_result', 'successful', 'rejected', 'onboarding')
);
