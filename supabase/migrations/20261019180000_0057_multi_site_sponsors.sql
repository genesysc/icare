-- Multi-site employers (founder, 2026-10-19): "a company can always have
-- multiple sites - list all the vacancies for the same company but different
-- locations, and display the location names."
--
-- Rule change to the 0056 badge logic: a job is listed (badge_register) when
-- the employer's NAME matches an active A-rated register entry, whether or
-- not the job's town equals the town the licence is registered at (usually a
-- head office). match_status still records which it was ('exact' = name +
-- town, 'name_only' = name only) and register_town keeps where the licence
-- is held, so the UI can say so. Name matching is still on the normalised
-- full name (sponsor_key), not fuzzy. Unregistered names stay in 'review'.
-- location_name = the site (e.g. a care home's name) shown beside the town.

alter table sponsored_jobs add column if not exists location_name text;
alter table sponsored_jobs add column if not exists register_town text;

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

  select * into m from match_sponsor(j.employer_name, j.town)
   order by (status = 'exact') desc, town limit 1;

  v_care := coalesce(j.soc_code in ('6135', '6136'), false)
            or j.title ~* '\m(senior\s+)?care\s+(worker|assistant)\M';

  update sponsored_jobs set
    match_status        = m.status,
    sponsor_id          = case when m.status in ('exact', 'name_only') then m.sponsor_id end,
    register_town       = case when m.status in ('exact', 'name_only') then m.town end,
    badge_register      = (m.status in ('exact', 'name_only')),
    care_switchers_only = v_care,
    badge_role          = (not v_care and j.soc_code is not null and j.salary_period = 'year'
                           and coalesce(j.salary_min, 0) >= 41700),
    status              = case
                            when j.status = 'closed' then 'closed'
                            when j.expires_at is not null and j.expires_at <= now() then 'closed'
                            when m.status in ('exact', 'name_only') then 'open'
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

-- Loader: same as 0056 plus location_name.
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
    source, source_job_id, title, employer_name, town, region, location_name,
    salary_min, salary_max, salary_period, soc_code, sector, contract_type, hours,
    apply_mode, apply_url, description, posted_at, expires_at, status
  ) values (
    coalesce(nullif(p_job->>'source', ''), 'manual'),
    p_job->>'source_job_id',
    btrim(p_job->>'title'),
    btrim(p_job->>'employer_name'),
    nullif(btrim(p_job->>'town'), ''),
    nullif(btrim(p_job->>'region'), ''),
    nullif(btrim(p_job->>'location_name'), ''),
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
    town = excluded.town, region = excluded.region, location_name = excluded.location_name,
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

-- Site names for the jobs already loaded, then re-badge everything.
update sponsored_jobs set location_name = case
  when source_job_id like 'renaissance-care:%' then (
    select v from (values
      ('meadowlark','Meadowlark Care Home'),('benvie','Benvie Care Home'),('glencairn','Glencairn Care Home'),
      ('riverside','Riverside Care Home'),('letham','Letham Park Care Home'),('malin','Malin Court Care Home'),
      ('berelands','Berelands Care Home'),('beech','Beech Manor Care Home'),('kingsmills','Kingsmills Care Home'),
      ('cranford','Cranford Care Home'),('cowdray','Cowdray Club Care Home'),('jesmond','Jesmond Care Home'),
      ('rosepark','Rosepark Care Home'),('whitecraigs','Whitecraigs Care Home'),('persley','Persley Castle Care Home'),
      ('wyndwell','Wyndwell Care Home'),('croftbank','Croftbank House Care Home')
    ) t(k, v) where source_job_id like '%/' || k || '%' limit 1)
  when source_job_id like 'hamill-homecare:%' then region
  else location_name end
 where location_name is null;

select count(*) filter (where (sponsored_job_rebadge(id)).status = 'open') as opened
  from sponsored_jobs where status <> 'closed';
