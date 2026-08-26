-- =============================================================================
-- Sprint 9 (partial) — shortlist stage tracking, via chat — plus two new
-- candidate_search filters the founder asked for in the same chat (years of
-- experience, qualification level, e.g. NVQ/Diploma L2 vs L3 Health & Social
-- Care). experience_months already existed on candidate_search; only the
-- qualification side needs a new column.
--
-- stage is text + check constraint, not a native enum, specifically so a
-- future migration can extend the allowed set with a single constraint
-- swap rather than the more awkward ALTER TYPE ... ADD VALUE a Postgres
-- enum requires — founder explicitly asked for "provisions to add more
-- stages later" when confirming this fixed list (shortlisted / interview /
-- offer / hired / rejected).
-- =============================================================================

alter table shortlists
  add column stage text not null default 'shortlisted'
    check (stage in ('shortlisted', 'interview', 'offer', 'hired', 'rejected')),
  add column stage_updated_at timestamptz not null default now();

-- "Shortlist 10 of them" needs to be safely re-runnable without creating
-- duplicate rows for the same employer/candidate pair (the chat tool below
-- upserts with ignoreDuplicates, relying on this).
alter table shortlists add constraint shortlists_employer_candidate_unique unique (employer_id, candidate_id);

-- Employers could INSERT and SELECT their own shortlist rows (0005) but had
-- no UPDATE policy at all — needed now for move_candidate_stage.
create policy shortlists_employer_update on shortlists
  for update using (employer_id = auth.uid() and is_verified_employer())
  with check (employer_id = auth.uid() and is_verified_employer());

-- Purely additive (new column appended at the very end, every existing
-- column's name/position untouched), so CREATE OR REPLACE VIEW is fine here
-- — unlike 0013's rewrite, which reordered/inserted columns before existing
-- ones and needed drop+recreate. Added `order by c.id` for determinism:
-- "shortlist the first 10" needs a stable, non-evaluative order across
-- repeated calls, not whatever arbitrary physical order an unordered query
-- happens to return.
create or replace view candidate_search as
select
  c.id,
  a.full_name,
  p.name           as primary_profession,
  p.family         as profession_family,
  c.headline,
  c.postcode_district,
  c.town,
  c.travel_radius_miles,
  c.availability,
  c.available_from,
  c.shift_prefs,
  c.right_to_work,
  c.min_hourly_rate,
  eh.job_title     as current_job_title,
  eh.employer      as current_employer,
  total_experience_months(c.id) as experience_months,
  coalesce(
    (select array_agg(cp2.profession_id) from candidate_professions cp2 where cp2.candidate_id = c.id),
    '{}'
  ) as profession_ids,
  coalesce(
    (select array_agg(cs.skill_id) from candidate_skills cs where cs.candidate_id = c.id),
    '{}'
  ) as skill_ids,
  coalesce(
    (select array_agg(cb.badge_code order by b.grade, b.label)
       from candidate_badges cb
       join badges b on b.code = cb.badge_code
      where cb.candidate_id = c.id
        and (cb.expires_at is null or cb.expires_at > now())),
    '{}'
  ) as badge_codes,
  coalesce(
    (select array_agg(distinct q.type_id) from qualifications q
      where q.candidate_id = c.id and q.type_id is not null and q.status <> 'rejected'),
    '{}'
  ) as qualification_type_ids
from candidates c
join accounts a on a.id = c.id
left join candidate_professions cp on cp.candidate_id = c.id and cp.is_primary
left join professions p on p.id = cp.profession_id
left join lateral (
  select eh2.job_title, eh2.employer
    from employment_history eh2
   where eh2.candidate_id = c.id and eh2.is_current
   order by eh2.started_on desc
   limit 1
) eh on true
where c.is_published and is_verified_employer()
order by c.id;
