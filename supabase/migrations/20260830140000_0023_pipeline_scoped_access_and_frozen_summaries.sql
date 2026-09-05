-- =============================================================================
-- Sprint 15 — Scoped, revocable, frozen-at-acceptance profile access.
--
-- HANDOVER.md §14 / SPRINTS.md: full profile access granted on candidate
-- acceptance is tied to the life of that specific job's pipeline, not
-- permanent. When the pipeline closes (candidate rejected, candidate
-- withdraws, or the job closes), the employer's access to those unlocked
-- fields revokes. "Access grants are pipeline-scoped and expire with the
-- pipeline, never a standing grant" — flagged as load-bearing, same
-- category as "no AI scoring."
--
-- shortlists already carries its consent per-row (candidate_consented_at),
-- and since Sprint 14 each row is already scoped to one job's pipeline —
-- so the missing piece isn't granularity, it's revocation: nothing today
-- clears access when a pipeline closes. closed_at is the new source of
-- truth for "is this pipeline still open" — every access check gains
-- "and closed_at is null" alongside its existing consent check.
-- =============================================================================

alter table shortlists add column closed_at timestamptz;

-- ---------------------------------------------------------------------------
-- set_shortlist_consent: re-scoped from (employer_id, candidate_id) to a
-- specific shortlist row id.
--
-- Real bug this fixes, found while building this sprint: Sprint 14 made it
-- possible for a candidate to hold more than one pipeline with the same
-- employer (one per job) but left this RPC matching by (employer_id,
-- candidate_id) alone — meaning consenting to ONE job's invite would have
-- silently consented (or withdrawn) EVERY pipeline that candidate has with
-- that employer. Same class of bug already fixed for move_candidate_stage
-- in Sprint 14; this one was missed then and is fixed now.
--
-- Also refuses to touch a closed pipeline — once closed_at is set, consent
-- history is frozen (an audit record of what was actually granted), not
-- something a stale client can still flip.
-- ---------------------------------------------------------------------------

-- Postgres won't let CREATE OR REPLACE rename a parameter (p_employer_id ->
-- p_shortlist_id) even with an identical (uuid, boolean) signature — has to
-- be dropped and recreated, then its anon revoke (from 0017) reapplied,
-- since a fresh CREATE FUNCTION resets grants to the PUBLIC-executable
-- default.
drop function set_shortlist_consent(uuid, boolean);

create function set_shortlist_consent(p_shortlist_id uuid, p_consent boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closed_at timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  select closed_at into v_closed_at from shortlists where id = p_shortlist_id and candidate_id = auth.uid();
  if not found then raise exception 'Shortlist not found'; end if;
  if v_closed_at is not null then raise exception 'This pipeline is closed'; end if;

  update shortlists
     set candidate_consented_at = case when p_consent then coalesce(candidate_consented_at, now()) else null end
   where id = p_shortlist_id
     and candidate_id = auth.uid();
end;
$$;

revoke execute on function set_shortlist_consent(uuid, boolean) from anon;

-- ---------------------------------------------------------------------------
-- get_candidate_dossier: the SECURITY DEFINER gate who_is_summary relies on
-- (employer-chat.ts). Its consent check never considered closed_at — a
-- rejected/withdrawn/job-closed pipeline would have kept working. Same
-- "access checks can't just be has this employer ever been granted access,
-- they need to check is there a currently-active pipeline" requirement
-- from the workflow handover §5.
-- ---------------------------------------------------------------------------

create or replace function get_candidate_dossier(p_candidate_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_result jsonb;
begin
  if not (
    is_verified_employer() and exists (
      select 1 from shortlists s
       where s.candidate_id = p_candidate_id
         and s.employer_id = auth.uid()
         and s.candidate_consented_at is not null
         and s.closed_at is null
    )
  ) then
    raise exception 'Not consented to view this candidate''s profile detail';
  end if;

  select jsonb_build_object(
    'full_name', a.full_name,
    'headline', c.headline,
    'about', c.about,
    'town', c.town,
    'experience_months', total_experience_months(c.id),
    'professions', (
      select coalesce(jsonb_agg(p.name), '[]'::jsonb)
        from candidate_professions cp join professions p on p.id = cp.profession_id
       where cp.candidate_id = c.id
    ),
    'skills', (
      select coalesce(jsonb_agg(cs2.label), '[]'::jsonb)
        from candidate_skills cs join clinical_skills cs2 on cs2.id = cs.skill_id
       where cs.candidate_id = c.id
    ),
    'qualifications', (
      select coalesce(jsonb_agg(jsonb_build_object('title', q.title, 'awarding_body', q.awarding_body, 'awarded_on', q.awarded_on)), '[]'::jsonb)
        from qualifications q
       where q.candidate_id = c.id
    ),
    'employment_history', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'employer', eh.employer, 'job_title', eh.job_title, 'setting', eh.setting,
               'started_on', eh.started_on, 'ended_on', eh.ended_on, 'is_current', eh.is_current,
               'description', eh.description
             ) order by eh.started_on desc), '[]'::jsonb)
        from employment_history eh
       where eh.candidate_id = c.id
    ),
    'prompts', (
      select coalesce(jsonb_agg(jsonb_build_object('label', pr.label, 'answer', cp3.answer)), '[]'::jsonb)
        from candidate_prompts cp3 join prompts pr on pr.id = cp3.prompt_id
       where cp3.candidate_id = c.id
    )
  )
  into v_result
  from candidates c join accounts a on a.id = c.id
  where c.id = p_candidate_id;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- profile_summaries — the frozen-at-acceptance snapshot. Workflow handover
-- §6: the entire profile view (factual data + descriptive summary)
-- generates ONCE, at the moment the candidate accepts (= consents), and
-- stays frozen for that pipeline's lifetime even if the candidate's live
-- profile changes underneath it. A fresh generation only happens for a
-- genuinely different pipeline. No UPDATE/DELETE policy anywhere on this
-- table — that omission IS the "frozen" guarantee, same pattern as
-- employer_verification_requests' append-only design (0007/Sprint 7).
--
-- employer_id/candidate_id are denormalized from shortlists (not just a
-- shortlist_id FK) purely so RLS doesn't need a join subquery on every
-- read — same tradeoff already made elsewhere in this schema (e.g.
-- shortlists itself duplicates employer_id/candidate_id rather than
-- forcing every policy through a join).
-- ---------------------------------------------------------------------------

create table profile_summaries (
  id             uuid primary key default gen_random_uuid(),
  shortlist_id   uuid not null unique references shortlists(id) on delete cascade,
  employer_id    uuid not null references employers(id) on delete cascade,
  candidate_id   uuid not null references candidates(id) on delete cascade,
  factual        jsonb not null,
  descriptive    text,
  generated_at   timestamptz not null default now()
);

alter table profile_summaries enable row level security;

-- Generated by the candidate's own consent action (src/candidates.ts), so
-- the insert runs under the candidate's own RLS-scoped client, not
-- service_role — hence an explicit candidate-scoped INSERT policy exists
-- here, unlike most system-generated tables in this schema.
create policy profile_summaries_candidate_insert on profile_summaries
  for insert with check (candidate_id = auth.uid());

create policy profile_summaries_candidate_read on profile_summaries
  for select using (candidate_id = auth.uid());

create policy profile_summaries_employer_read on profile_summaries
  for select using (employer_id = auth.uid() and is_verified_employer());
