-- =============================================================================
-- 0053 — Sponsor register refresh steps (follows 0052).
--
-- ⚠️ NOT YET APPLIED to the live project as of 2026-10-14. The Supabase
-- MCP tool holds any migration containing DELETE for human confirmation,
-- and those calls timed out unattended. Apply by approving it when an
-- agent retries, or by pasting this whole file into the Supabase SQL editor
-- (project care-register). Safe to run more than once.
--
-- The run is split into steps because the publishable-key role (anon)
-- has a 3s statement_timeout, and a first-ever load of ~122k rows takes
-- ~7s in one statement (measured 2026-10-14). Daily runs only write the
-- few hundred rows that actually changed, so `apply` normally finishes in
-- one call; the first load takes ~30.
--
--   sponsor_refresh_begin    open a register_runs row, clear staging
--   sponsor_refresh_load     (0052) batches of raw rows into staging
--   sponsor_refresh_check    validate row count + sharp-drop guard
--   sponsor_refresh_apply    upsert the next chunk of new/changed rows;
--                            call until it returns 0
--   sponsor_refresh_complete deactivate employers no longer listed, log
--                            added/removed, mark the run complete
--
-- Nothing is ever removed from the live list until `complete`, so an
-- interrupted run never hides a sponsor; at worst some new/changed rows
-- from today's register are already visible, and the next run finishes
-- the job (begin marks the stale run failed and starts again).
-- =============================================================================

alter table register_runs drop constraint if exists register_runs_status_check;
alter table register_runs add constraint register_runs_status_check
  check (status in ('loading', 'applying', 'complete', 'failed'));

-- Shared secret for the GitHub Action. Generated here, inside the
-- database, so it never passes through chat or git. After running this
-- file, read it with:
--   select value from app_secrets where key = 'sponsor_refresh_secret';
-- and save it as the GitHub Actions secret SPONSOR_REFRESH_SECRET.
insert into app_secrets (key, value)
values ('sponsor_refresh_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

create or replace function sponsor_refresh_begin(p_secret text, p_register_date date, p_source_url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run uuid;
begin
  perform sponsor_refresh_check_secret(p_secret);

  if exists (select 1 from register_runs where status = 'complete' and register_date >= p_register_date) then
    return jsonb_build_object('skip', true, 'reason', 'register already current');
  end if;

  update register_runs set status = 'failed', note = coalesce(note, 'interrupted'), run_at = now()
   where status in ('loading', 'applying');
  delete from sponsors_staging;

  insert into register_runs (register_date, source_url) values (p_register_date, p_source_url)
  returning id into v_run;

  return jsonb_build_object('skip', false, 'run_id', v_run);
end;
$$;

-- Fails the run (and returns ok=false) if the staged row count is off, or
-- if the new register is under 90% of yesterday's active sponsors — far
-- more likely a truncated/changed file than ~10% of UK sponsors losing
-- licences overnight. The GitHub Action then exits non-zero.
create or replace function sponsor_refresh_check(p_secret text, p_run_id uuid, p_expected_rows integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run     register_runs%rowtype;
  v_staged  integer;
  v_new     integer;
  v_active  integer;
  v_added   integer;
begin
  perform sponsor_refresh_check_secret(p_secret);

  select * into v_run from register_runs where id = p_run_id for update;
  if v_run.id is null or v_run.status <> 'loading' then
    raise exception 'run is not loading';
  end if;

  select count(*) into v_staged from sponsors_staging where run_id = p_run_id;
  if v_staged <> p_expected_rows then
    update register_runs set status = 'failed', run_at = now(),
           note = format('staged %s rows, expected %s', v_staged, p_expected_rows)
     where id = p_run_id;
    delete from sponsors_staging where run_id = p_run_id;
    return jsonb_build_object('ok', false, 'error', 'staged row count mismatch', 'staged', v_staged, 'expected', p_expected_rows);
  end if;

  select count(distinct (name_key, town_key)) into v_new
    from sponsors_staging where run_id = p_run_id and name_key <> '';
  select count(*) into v_active from sponsors where active;

  if v_active > 0 and v_new < v_active * 0.9 then
    update register_runs set status = 'failed', run_at = now(), row_count = v_new,
           note = format('row count dropped sharply: %s -> %s, not applied', v_active, v_new)
     where id = p_run_id;
    delete from sponsors_staging where run_id = p_run_id;
    return jsonb_build_object('ok', false, 'error', 'row count dropped sharply', 'previous', v_active, 'new', v_new);
  end if;

  -- New today, or back after being removed — counted before apply runs.
  select count(*) into v_added
    from (select distinct name_key, town_key from sponsors_staging where run_id = p_run_id and name_key <> '') n
   where not exists (select 1 from sponsors s where s.name_key = n.name_key and s.town_key = n.town_key and s.active);

  update register_runs set status = 'applying', row_count = v_new, added = v_added where id = p_run_id;
  return jsonb_build_object('ok', true, 'row_count', v_new, 'added', v_added, 'previous', v_active);
end;
$$;

-- Upserts up to p_limit staged rows that are new or differ from the live
-- row. Returns how many it wrote; the caller loops until 0.
create or replace function sponsor_refresh_apply(p_secret text, p_run_id uuid, p_limit integer default 4000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run    register_runs%rowtype;
  v_count  integer;
begin
  perform sponsor_refresh_check_secret(p_secret);

  select * into v_run from register_runs where id = p_run_id;
  if v_run.id is null or v_run.status <> 'applying' then
    raise exception 'run is not applying';
  end if;

  insert into sponsors as s (name, town, county, rating, name_key, town_key, first_seen_date)
  select n.name, n.town, n.county, n.rating, n.name_key, n.town_key, v_run.register_date
    from (
      select distinct on (name_key, town_key) name, town, county, rating, name_key, town_key
        from sponsors_staging
       where run_id = p_run_id and name_key <> ''
       order by name_key, town_key, name
    ) n
   where not exists (
     select 1 from sponsors x
      where x.name_key = n.name_key and x.town_key = n.town_key and x.active
        and x.name = n.name and x.town = n.town
        and x.county is not distinct from n.county and x.rating = n.rating
   )
   limit least(greatest(coalesce(p_limit, 4000), 1), 10000)
  on conflict (name_key, town_key) do update
     set name = excluded.name, town = excluded.town, county = excluded.county,
         rating = excluded.rating, active = true, removed_date = null, updated_at = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function sponsor_refresh_complete(p_secret text, p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run      register_runs%rowtype;
  v_removed  integer;
begin
  perform sponsor_refresh_check_secret(p_secret);

  select * into v_run from register_runs where id = p_run_id for update;
  if v_run.id is null or v_run.status <> 'applying' then
    raise exception 'run is not applying';
  end if;

  update sponsors s set active = false, removed_date = v_run.register_date, updated_at = now()
   where s.active
     and not exists (
       select 1 from sponsors_staging st
        where st.run_id = p_run_id and st.name_key = s.name_key and st.town_key = s.town_key
     );
  get diagnostics v_removed = row_count;

  delete from sponsors_staging where run_id = p_run_id;

  update register_runs set status = 'complete', run_at = now(), removed = v_removed where id = p_run_id;

  return jsonb_build_object('ok', true, 'register_date', v_run.register_date,
                            'row_count', v_run.row_count, 'added', v_run.added, 'removed', v_removed);
end;
$$;

create index if not exists sponsors_staging_run_key_idx on sponsors_staging (run_id, name_key, town_key);

revoke all on function sponsor_refresh_begin, sponsor_refresh_check, sponsor_refresh_apply, sponsor_refresh_complete
  from public, authenticated;
grant execute on function sponsor_refresh_begin, sponsor_refresh_check, sponsor_refresh_apply, sponsor_refresh_complete
  to anon;
