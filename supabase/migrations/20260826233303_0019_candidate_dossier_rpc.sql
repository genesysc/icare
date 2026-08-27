-- =============================================================================
-- Sprint 10 — "Who is [name]" AI summary. employment_history and
-- qualifications had NO employer-facing RLS policy at all (checked
-- pg_policy directly first) — candidate_professions/candidate_skills are
-- published-gated, registrations/dbs_records/candidate_contact are
-- shortlist+consent-gated, but employment_history/qualifications were
-- candidate_self only, full stop. Rather than bolt on more RLS policies
-- across five different tables, a single security-definer RPC is the
-- actual gate — same "one narrow, auditable action" pattern as
-- flag_candidate_post/set_shortlist_consent — checked once, in one place,
-- for the whole dossier this tool needs.
--
-- Gated at shortlist + consent specifically (not just published), same
-- level as photo/video/CV — this is materially more detail than search
-- results ever show, so it gets the richer-data gate, not the search gate.
-- =============================================================================

create function get_candidate_dossier(p_candidate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
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

revoke execute on function get_candidate_dossier(uuid) from anon;
