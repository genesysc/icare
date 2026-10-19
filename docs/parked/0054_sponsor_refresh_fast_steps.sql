-- =============================================================================
-- 0054 — Make the daily sponsor refresh fit anon's 3s statement timeout.
--
-- Found on the first daily run (15 Oct 2026): with 122k sponsors already
-- loaded, sponsor_refresh_check took ~3.7s (a 1.3s DISTINCT sort over
-- staging + a 2.4s anti-join against sponsors that had to visit the heap
-- for `active`) and timed out. apply/complete did similar work. A
-- function-level `set statement_timeout` does NOT help — tested: the
-- timer is armed before the function's SET runs.
--
-- Fixes:
--   * staging is de-duplicated on load (unique (run_id, name_key,
--     town_key) + ON CONFLICT DO NOTHING) — no DISTINCT sort later;
--   * a row_hash (md5 of name|town|county|rating) on both tables, and a
--     partial index on sponsors (name_key, town_key, row_hash) WHERE
--     active, so "unchanged?" and "still listed?" are index-only checks;
--   * staging is emptied by TRUNCATE at the start of the next run instead
--     of a 122k-row DELETE at the end.
--
-- Contains DELETE/DROP/TRUNCATE, so the Supabase MCP tool holds it for
-- human approval — paste into the SQL editor (project care-register).
-- Safe to run more than once.
-- =============================================================================

-- Clear any half-finished run (15 Oct's timed-out check left one).
update register_runs set status = 'failed', note = coalesce(note, 'interrupted'), run_at = now()
 where status in ('loading', 'applying');
truncate sponsors_staging;

alter table sponsors_staging add column if not exists row_hash text;
drop index if exists sponsors_staging_run_key_idx;
create unique index if not exists sponsors_staging_run_key_uidx on sponsors_staging (run_id, name_key, town_key);

alter table sponsors add column if not exists row_hash text;
update sponsors
   set row_hash = md5(name || '|' || town || '|' || coalesce(county, '') || '|' || rating)
 where row_hash is null;
create index if not exists sponsors_active_key_hash_idx on sponsors (name_key, town_key, row_hash) where active;

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
  -- Previous run's rows. TRUNCATE (instant) rather than DELETE; this
  -- function runs as the table owner.
  truncate sponsors_staging;
  insert into register_runs (register_date, source_url) values (p_register_date, p_source_url)
  returning id into v_run;
  return jsonb_build_object('skip', false, 'run_id', v_run);
end;
$$;

-- Returns the number of NEW (name_key, town_key) rows staged by this batch
-- (duplicates within the register are dropped here). The script sums
-- these and passes the total to sponsor_refresh_check.
create or replace function sponsor_refresh_load(p_secret text, p_run_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  perform sponsor_refresh_check_secret(p_secret);
  if not exists (select 1 from register_runs where id = p_run_id and status = 'loading') then
    raise exception 'run is not loading';
  end if;

  insert into sponsors_staging (run_id, name, town, county, rating, name_key, town_key, row_hash)
  select p_run_id, r.name, r.town, r.county, r.rating, r.name_key, r.town_key,
         md5(r.name || '|' || r.town || '|' || coalesce(r.county, '') || '|' || r.rating)
    from (
      select regexp_replace(btrim(x.name), '\s+', ' ', 'g') as name,
             regexp_replace(btrim(coalesce(x.town, '')), '\s+', ' ', 'g') as town,
             nullif(btrim(coalesce(x.county, '')), '') as county,
             btrim(x.rating) as rating,
             sponsor_key(x.name) as name_key,
             sponsor_key(x.town) as town_key
        from jsonb_to_recordset(p_rows) as x(name text, town text, county text, rating text)
       where x.name is not null
    ) r
   where r.name_key <> ''
  on conflict (run_id, name_key, town_key) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function sponsor_refresh_check(p_secret text, p_run_id uuid, p_expected_rows integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run     register_runs%rowtype;
  v_new     integer;
  v_active  integer;
  v_added   integer;
begin
  perform sponsor_refresh_check_secret(p_secret);

  select * into v_run from register_runs where id = p_run_id for update;
  if v_run.id is null or v_run.status <> 'loading' then
    raise exception 'run is not loading';
  end if;

  select count(*) into v_new from sponsors_staging where run_id = p_run_id;
  if v_new <> p_expected_rows then
    update register_runs set status = 'failed', run_at = now(),
           note = format('staged %s rows, expected %s', v_new, p_expected_rows)
     where id = p_run_id;
    return jsonb_build_object('ok', false, 'error', 'staged row count mismatch', 'staged', v_new, 'expected', p_expected_rows);
  end if;

  select count(*) into v_active from sponsors where active;

  -- Under 90% of yesterday is far more likely a truncated/changed file
  -- than ~10% of UK sponsors losing licences overnight: refuse.
  if v_active > 0 and v_new < v_active * 0.9 then
    update register_runs set status = 'failed', run_at = now(), row_count = v_new,
           note = format('row count dropped sharply: %s -> %s, not applied', v_active, v_new)
     where id = p_run_id;
    return jsonb_build_object('ok', false, 'error', 'row count dropped sharply', 'previous', v_active, 'new', v_new);
  end if;

  select count(*) into v_added
    from sponsors_staging n
   where n.run_id = p_run_id
     and not exists (select 1 from sponsors s where s.active and s.name_key = n.name_key and s.town_key = n.town_key);

  update register_runs set status = 'applying', row_count = v_new, added = v_added where id = p_run_id;
  return jsonb_build_object('ok', true, 'row_count', v_new, 'added', v_added, 'previous', v_active);
end;
$$;

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

  -- New, re-listed, or changed (hash differs) — index-only checks.
  insert into sponsors as s (name, town, county, rating, name_key, town_key, row_hash, first_seen_date)
  select n.name, n.town, n.county, n.rating, n.name_key, n.town_key, n.row_hash, v_run.register_date
    from sponsors_staging n
   where n.run_id = p_run_id
     and not exists (
       select 1 from sponsors x
        where x.active and x.name_key = n.name_key and x.town_key = n.town_key and x.row_hash = n.row_hash
     )
   limit least(greatest(coalesce(p_limit, 4000), 1), 10000)
  on conflict (name_key, town_key) do update
     set name = excluded.name, town = excluded.town, county = excluded.county,
         rating = excluded.rating, row_hash = excluded.row_hash,
         active = true, removed_date = null, updated_at = now();

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

  -- Staging is left for the next run's begin() to TRUNCATE.
  update register_runs set status = 'complete', run_at = now(), removed = v_removed where id = p_run_id;

  return jsonb_build_object('ok', true, 'register_date', v_run.register_date,
                            'row_count', v_run.row_count, 'added', v_run.added, 'removed', v_removed);
end;
$$;

revoke all on function sponsor_refresh_begin, sponsor_refresh_load, sponsor_refresh_check,
  sponsor_refresh_apply, sponsor_refresh_complete from public, authenticated;
grant execute on function sponsor_refresh_begin, sponsor_refresh_load, sponsor_refresh_check,
  sponsor_refresh_apply, sponsor_refresh_complete to anon;

analyze sponsors;
analyze sponsors_staging;
