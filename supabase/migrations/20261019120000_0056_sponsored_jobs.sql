-- 0056 — UK sponsored jobs board (HANDOVER.md §27, sponsored-jobs handover §4/§7/§9).
--
-- Separate from the employer-private iRecruit `jobs` table (0020): this is
-- the public-to-members board of health & care jobs from employers on the
-- Home Office sponsor register. Launch source is 'manual' — the founder
-- supplies a list and an agent loads it with upsert_sponsored_job(); Reed /
-- Adzuna can feed the same function later.
--
-- Trust rules enforced here, not just in the UI:
--   * A job is only visible when its employer is an EXACT (name + town)
--     match on the active register (badge_register). name_only / none go to
--     status 'review' and are never shown.
--   * badge_role ("Role meets visa rules") is conservative: needs a SOC
--     code AND an annual salary_min >= £41,700. Lower health & care
--     thresholds exist but aren't modelled yet, so those jobs simply don't
--     get the badge — never a guessed pass.
--   * Care worker / senior care worker (SOC 6135/6136, or the title) are
--     tagged care_switchers_only and never get badge_role.
--   * badge_employer_confirmed is never set by this migration's functions —
--     reserved for iRecruit's employer-confirmed sponsorship (Phase 5).
--   * Visible only to signed-in candidates who have finished onboarding
--     (founder, 2026-10-19: "only accessible once someone has created a
--     profile").

create table if not exists sponsored_jobs (
  id                        uuid primary key default gen_random_uuid(),
  source                    text not null default 'manual'
                              check (source in ('manual', 'reed', 'adzuna', 'irecruit')),
  source_job_id             text not null,
  title                     text not null check (length(title) between 2 and 200),
  employer_name             text not null check (length(employer_name) between 2 and 200),
  town                      text,
  region                    text,
  sponsor_id                uuid references sponsors(id) on delete set null,
  match_status              text not null default 'none'
                              check (match_status in ('exact', 'name_only', 'none')),
  salary_min                numeric(10, 2),
  salary_max                numeric(10, 2),
  salary_period             text not null default 'year' check (salary_period in ('year', 'hour')),
  soc_code                  text,
  sector                    text,
  contract_type             text,
  hours                     text,
  care_switchers_only       boolean not null default false,
  apply_mode                text not null default 'external' check (apply_mode in ('external', 'direct')),
  apply_url                 text check (apply_url is null or apply_url ~* '^https?://'),
  description               text,
  posted_at                 timestamptz not null default now(),
  expires_at                timestamptz,
  status                    text not null default 'review' check (status in ('open', 'closed', 'review')),
  badge_register            boolean not null default false,
  badge_role                boolean not null default false,
  badge_employer_confirmed  boolean not null default false,
  register_date             date,
  checked_at                timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (source, source_job_id),
  check (apply_mode = 'direct' or apply_url is not null)
);

create index if not exists sponsored_jobs_visible_idx on sponsored_jobs (posted_at desc)
  where status = 'open' and badge_register;
create index if not exists sponsored_jobs_title_trgm on sponsored_jobs using gin (title gin_trgm_ops);

create table if not exists sponsored_job_applications (
  id            uuid primary key default gen_random_uuid(),
  job_id        uuid not null references sponsored_jobs(id) on delete cascade,
  candidate_id  uuid not null references candidates(id) on delete cascade,
  status        text not null default 'new' check (status in ('new', 'reviewed', 'forwarded', 'rejected')),
  -- Per-application routing (admin now, employer later) so changing where
  -- applications go needs no rebuild.
  destination   text not null default 'admin',
  note          text check (note is null or length(note) <= 1000),
  created_at    timestamptz not null default now(),
  unique (job_id, candidate_id)
);
create index if not exists sponsored_job_applications_created_idx on sponsored_job_applications (created_at);

-- ---- Gate: a signed-in candidate with a finished profile ----
create or replace function candidate_onboarding_done()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select onboarding_done from candidates where id = auth.uid()), false);
$$;
revoke all on function candidate_onboarding_done from public, anon;
grant execute on function candidate_onboarding_done to authenticated;

alter table sponsored_jobs enable row level security;
alter table sponsored_job_applications enable row level security;

create policy sponsored_jobs_member_read on sponsored_jobs
  for select to authenticated
  using (
    status = 'open' and badge_register
    and (expires_at is null or expires_at > now())
    and current_role_is('candidate') and candidate_onboarding_done()
  );

create policy sponsored_job_applications_self_read on sponsored_job_applications
  for select to authenticated
  using (candidate_id = auth.uid());
-- No client insert/update/delete policies: applying goes through
-- apply_to_sponsored_job() below, the only way in.

-- ---- Badge logic (shared by upsert + daily re-check) ----
create or replace function sponsored_job_rebadge(p_id uuid)
returns sponsored_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  j sponsored_jobs;
  m record;
  v_reg date;
  v_care boolean;
begin
  select * into j from sponsored_jobs where id = p_id for update;
  if not found then return null; end if;

  select register_date into v_reg from register_runs
   where status = 'complete' order by register_date desc limit 1;

  select * into m from match_sponsor(j.employer_name, j.town) limit 1;

  v_care := coalesce(j.soc_code in ('6135', '6136'), false)
            or j.title ~* '\m(senior\s+)?care\s+(worker|assistant)\M';

  update sponsored_jobs set
    match_status        = m.status,
    sponsor_id          = case when m.status = 'exact' then m.sponsor_id end,
    badge_register      = (m.status = 'exact'),
    care_switchers_only = v_care,
    badge_role          = (not v_care and j.soc_code is not null and j.salary_period = 'year'
                           and coalesce(j.salary_min, 0) >= 41700),
    status              = case
                            when j.status = 'closed' then 'closed'
                            when j.expires_at is not null and j.expires_at <= now() then 'closed'
                            when m.status = 'exact' then 'open'
                            else 'review'
                          end,
    register_date       = v_reg,
    checked_at          = now(),
    updated_at          = now()
  where id = p_id
  returning * into j;
  return j;
end;
$$;
revoke all on function sponsored_job_rebadge from public, anon, authenticated;

-- ---- Loader: one job per call, keyed on (source, source_job_id) ----
-- Called by an agent/admin with the service role or in the SQL editor —
-- never by a client (execute revoked from anon/authenticated).
-- p_job keys: source_job_id (required), title, employer_name, town, region,
-- salary_min, salary_max, salary_period, soc_code, sector, contract_type,
-- hours, apply_mode, apply_url, description, posted_at, expires_at,
-- status ('open' to (re)list, 'closed' to take down), source.
create or replace function upsert_sponsored_job(p_job jsonb)
returns table (id uuid, status text, match_status text, badge_register boolean, badge_role boolean, care_switchers_only boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_id uuid;
  j sponsored_jobs;
  v_status text := case when p_job->>'status' = 'closed' then 'closed' else 'review' end;
begin
  insert into sponsored_jobs as t (
    source, source_job_id, title, employer_name, town, region,
    salary_min, salary_max, salary_period, soc_code, sector, contract_type, hours,
    apply_mode, apply_url, description, posted_at, expires_at, status
  ) values (
    coalesce(nullif(p_job->>'source', ''), 'manual'),
    p_job->>'source_job_id',
    btrim(p_job->>'title'),
    btrim(p_job->>'employer_name'),
    nullif(btrim(p_job->>'town'), ''),
    nullif(btrim(p_job->>'region'), ''),
    nullif(p_job->>'salary_min', '')::numeric,
    nullif(p_job->>'salary_max', '')::numeric,
    coalesce(nullif(p_job->>'salary_period', ''), 'year'),
    nullif(btrim(p_job->>'soc_code'), ''),
    nullif(btrim(p_job->>'sector'), ''),
    nullif(btrim(p_job->>'contract_type'), ''),
    nullif(btrim(p_job->>'hours'), ''),
    coalesce(nullif(p_job->>'apply_mode', ''), case when nullif(p_job->>'apply_url', '') is null then 'direct' else 'external' end),
    nullif(btrim(p_job->>'apply_url'), ''),
    nullif(p_job->>'description', ''),
    coalesce(nullif(p_job->>'posted_at', '')::timestamptz, now()),
    nullif(p_job->>'expires_at', '')::timestamptz,
    v_status
  )
  on conflict (source, source_job_id) do update set
    title = excluded.title, employer_name = excluded.employer_name,
    town = excluded.town, region = excluded.region,
    salary_min = excluded.salary_min, salary_max = excluded.salary_max,
    salary_period = excluded.salary_period, soc_code = excluded.soc_code,
    sector = excluded.sector, contract_type = excluded.contract_type, hours = excluded.hours,
    apply_mode = excluded.apply_mode, apply_url = excluded.apply_url,
    description = excluded.description, posted_at = excluded.posted_at,
    expires_at = excluded.expires_at, status = excluded.status, updated_at = now()
  returning t.id into v_id;

  j := sponsored_job_rebadge(v_id);
  return query select j.id, j.status, j.match_status, j.badge_register, j.badge_role, j.care_switchers_only;
end;
$$;
revoke all on function upsert_sponsored_job from public, anon, authenticated;

-- ---- Daily re-check after each register refresh ----
-- Gated by the existing sponsor_refresh_secret (0053) so the register
-- refresh Action can call it with the anon key, like its other steps.
create or replace function sponsored_jobs_recheck(p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_n integer := 0;
begin
  perform sponsor_refresh_check_secret(p_secret);
  for r in select id from sponsored_jobs where status <> 'closed' loop
    perform sponsored_job_rebadge(r.id);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object(
    'rechecked', v_n,
    'open', (select count(*) from sponsored_jobs where status = 'open'),
    'review', (select count(*) from sponsored_jobs where status = 'review')
  );
end;
$$;
revoke all on function sponsored_jobs_recheck from public, authenticated;
grant execute on function sponsored_jobs_recheck to anon;

-- ---- Apply (consent event for this one job) ----
create or replace function apply_to_sponsored_job(p_job_id uuid, p_note text default null)
returns sponsored_job_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  a sponsored_job_applications;
begin
  if not (current_role_is('candidate') and candidate_onboarding_done()) then
    raise exception 'Finish your profile to apply' using errcode = '42501';
  end if;
  if not exists (
    select 1 from sponsored_jobs
     where id = p_job_id and status = 'open' and badge_register and apply_mode = 'direct'
       and (expires_at is null or expires_at > now())
  ) then
    raise exception 'This job is not open for applications on iCare' using errcode = 'P0002';
  end if;

  insert into sponsored_job_applications (job_id, candidate_id, note)
  values (p_job_id, auth.uid(), nullif(btrim(left(p_note, 1000)), ''))
  on conflict (job_id, candidate_id) do nothing
  returning * into a;
  if a.id is null then
    select * into a from sponsored_job_applications where job_id = p_job_id and candidate_id = auth.uid();
  end if;
  return a;
end;
$$;
revoke all on function apply_to_sponsored_job from public, anon;
grant execute on function apply_to_sponsored_job to authenticated;
