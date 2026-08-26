-- =============================================================================
-- Sprint 8 — employer chat + candidate search.
--
-- candidate_search (from 0001_init) was a plain view with no verification
-- gate at all — anyone able to query it saw every published candidate,
-- regardless of is_verified_employer(). It also lacked the fields the
-- founder's non-negotiable #4 override (2026-08-26 in HANDOVER.md)
-- requires showing pre-shortlist: candidate name and current job title.
--
-- Views created by the migration role run with that role's privileges
-- against the underlying tables (the same reason candidate_search already
-- worked without any RLS policy of its own) — so this view can safely join
-- accounts.full_name and employment_history without granting employers any
-- direct RLS access to those tables. The view's own WHERE clause is now the
-- only gate, and it explicitly requires is_verified_employer() — closing
-- the gap above. Only full_name is selected from accounts, never
-- email/phone (those stay behind candidate_contact + shortlist consent,
-- untouched by this migration). No dependents on the old column order
-- (checked pg_depend first), so drop + recreate rather than
-- CREATE OR REPLACE (which can't reorder/insert columns before existing ones).
-- =============================================================================

drop view candidate_search;

create view candidate_search as
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
  ) as badge_codes
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
where c.is_published and is_verified_employer();

-- -----------------------------------------------------------------------------
-- Employer chat thread — append-only, one row per message. Persists the
-- conversation across page loads. tool_call/result_count are populated only
-- on messages that triggered a search_candidates call, for history replay.
-- -----------------------------------------------------------------------------

create table employer_chat_messages (
  id            bigint generated always as identity primary key,
  employer_id   uuid not null references employers(id) on delete cascade,
  role          text not null check (role in ('user', 'assistant')),
  content       text not null,
  tool_call     jsonb,
  result_count  int,
  created_at    timestamptz not null default now()
);

create index on employer_chat_messages (employer_id, created_at);

alter table employer_chat_messages enable row level security;

create policy employer_chat_messages_self on employer_chat_messages
  for all using (employer_id = auth.uid()) with check (employer_id = auth.uid());
