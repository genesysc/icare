-- Founder confirmed 2026-09-18: a candidate's professional registration
-- number (NMC/HCPC/etc. PIN) and right-to-work status must be invisible
-- to other candidates/platform users (member.html already enforces
-- this, migration 0047) and visible to an employer only once the
-- candidate has accepted that employer's invite for a specific job —
-- not before, not as a standing grant.
--
-- Checking get_candidate_dossier (0019) — the one function actually
-- gated on that exact condition (is_verified_employer() + shortlist
-- with candidate_consented_at set) — found it never included either
-- field at all. RLS on `registrations` (registrations_shortlisted,
-- 0005) already permits an employer to read reg_number post-consent,
-- but nothing ever queried it: the dossier this RPC builds only
-- returned professions/skills/qualifications/employment_history/
-- prompts. Right-to-work was never in the dossier gate anywhere.
-- Net effect: the number was already correctly access-controlled, just
-- not actually shown to anyone yet post-consent. Fixing that gap now,
-- inside the existing gate rather than adding a new one.
create or replace function get_candidate_dossier(p_candidate_id uuid)
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
    'right_to_work', c.right_to_work,
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
    'registrations', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'regulator', r.regulator, 'register_name', r.register_name,
               'reg_number', r.reg_number, 'status', r.status, 'expires_on', r.expires_on
             )), '[]'::jsonb)
        from registrations r
       where r.candidate_id = c.id
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
