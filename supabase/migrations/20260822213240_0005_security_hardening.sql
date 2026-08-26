-- =============================================================================
-- 0005_security_hardening.sql
--
-- Closes gaps the Supabase security advisor found after 0001-0004 landed.
-- None of these change product behaviour; they make the RLS design already
-- described in 0001-0004's own comments actually take effect.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Reference/catalogue tables: readable by anyone, writable by no one via the
-- API (only migrations touch these). Missing RLS meant they were open to
-- writes from any caller with an anon key.
-- -----------------------------------------------------------------------------

alter table professions        enable row level security;
alter table clinical_skills    enable row level security;
alter table qualification_types enable row level security;
alter table badges             enable row level security;
alter table prompts            enable row level security;

create policy professions_read on professions for select using (true);
create policy clinical_skills_read on clinical_skills for select using (true);
create policy qualification_types_read on qualification_types for select using (true);
create policy badges_catalogue_read on badges for select using (true);
create policy prompts_read on prompts for select using (true);

-- -----------------------------------------------------------------------------
-- Candidate-owned tables that had RLS enabled with no policies at all
-- (employment_history, qualifications — meaning candidates couldn't touch
-- their own rows) or no RLS whatsoever (candidate_professions,
-- candidate_skills, registrations). Same self-ownership pattern already used
-- for candidate_contact, dbs_records and cv_imports.
-- -----------------------------------------------------------------------------

create policy employment_history_self on employment_history
  for all using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());

create policy qualifications_self on qualifications
  for all using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());

alter table candidate_professions enable row level security;
create policy candidate_professions_self on candidate_professions
  for all using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());
create policy candidate_professions_read_published on candidate_professions
  for select using (
    public.is_verified_employer()
    and exists (select 1 from candidates c
                 where c.id = candidate_professions.candidate_id and c.is_published)
  );

alter table candidate_skills enable row level security;
create policy candidate_skills_self on candidate_skills
  for all using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());
create policy candidate_skills_read_published on candidate_skills
  for select using (
    public.is_verified_employer()
    and exists (select 1 from candidates c
                 where c.id = candidate_skills.candidate_id and c.is_published)
  );

-- Registration numbers are checked against a public regulator register, so
-- they're less sensitive than a DBS certificate number, but they still had no
-- RLS at all. Same shortlist-gated read as dbs_records.
alter table registrations enable row level security;
create policy registrations_self on registrations
  for all using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());
create policy registrations_shortlisted on registrations
  for select using (
    public.is_verified_employer()
    and exists (
      select 1 from shortlists s
       where s.candidate_id = registrations.candidate_id
         and s.employer_id  = auth.uid()
         and s.candidate_consented_at is not null
    )
  );

-- Referee name/org/email is a third party's PII, not the candidate's. No
-- employer-read policy: the "Two References Held" badge is what employers
-- see, not the referee's details, and the Regulation 22 hand-to-hirer duty
-- belongs to the placement flow that isn't built yet (see 0001's closing
-- note) — don't open this table until that flow decides how it's released.
alter table candidate_references enable row level security;
create policy candidate_references_self on candidate_references
  for all using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());

-- -----------------------------------------------------------------------------
-- shortlists — the table the whole "released at shortlist + consent" design
-- depends on. It had no RLS at all: any authenticated caller could read every
-- shortlist, or set candidate_consented_at on someone else's row directly.
--
-- Consent must come from the candidate. This RLS-only version lets a
-- candidate update their own row (including candidate_consented_at) and lets
-- a verified employer create/read their own shortlists, but nothing stops a
-- candidate from also touching their row's other columns via the same PATCH.
-- A security definer consent function (mirroring publish_my_profile) is the
-- precise fix; this is a stopgap since no application code exercises this
-- table yet.
-- -----------------------------------------------------------------------------

alter table shortlists enable row level security;

create policy shortlists_employer_insert on shortlists
  for insert with check (employer_id = auth.uid() and public.is_verified_employer());

create policy shortlists_employer_read on shortlists
  for select using (employer_id = auth.uid());

create policy shortlists_candidate_read on shortlists
  for select using (candidate_id = auth.uid());

create policy shortlists_candidate_consent on shortlists
  for update using (candidate_id = auth.uid())
  with check (candidate_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Views created without security_invoker run with the view owner's
-- privileges, not the querying user's — meaning they can silently bypass the
-- RLS policies on the tables they select from. candidate_search is the
-- employer-facing search surface; without this it could have let anyone,
-- verified employer or not, read every published candidate for free.
-- -----------------------------------------------------------------------------

alter view candidate_search set (security_invoker = true);
alter view onboarding_funnel set (security_invoker = true);

-- -----------------------------------------------------------------------------
-- Function search_path hardening. None of these are SECURITY DEFINER (those
-- already set search_path in 0001-0003), but an unset search_path is still a
-- schema-injection foothold if a future migration ever adds a writable schema
-- ahead of public in the session's default path.
-- -----------------------------------------------------------------------------

alter function public.total_experience_months(uuid) set search_path = public;
alter function public.refresh_experience_badges(uuid) set search_path = public;
alter function public.trg_refresh_experience() set search_path = public;
alter function public.decay_stale_availability() set search_path = public;
alter function public.profile_completeness(uuid) set search_path = public;
alter function public.can_publish(uuid) set search_path = public;
alter function public.refresh_completeness(uuid) set search_path = public;
alter function public.trg_refresh_completeness() set search_path = public;
alter function public.purge_stale_cv_imports() set search_path = public;

-- -----------------------------------------------------------------------------
-- Trigger-only functions were reachable by anon/authenticated via
-- /rest/v1/rpc/<name> — Postgres refuses to run a trigger function outside a
-- trigger context, so this was never actually exploitable, but there's no
-- reason to leave the RPC endpoint listed. Postgres grants EXECUTE to PUBLIC
-- by default, so the explicit "to authenticated" grants on close_my_account
-- and publish_my_profile in 0002/0003 didn't actually exclude anon either —
-- revoke from PUBLIC first, then grant back only where a client should call it.
-- -----------------------------------------------------------------------------

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.lock_account_role() from public;
revoke execute on function public.sync_account_email() from public;
revoke execute on function public.lock_employer_verification() from public;

revoke execute on function public.close_my_account(text) from public;
grant execute on function public.close_my_account(text) to authenticated;

revoke execute on function public.publish_my_profile() from public;
grant execute on function public.publish_my_profile() to authenticated;
