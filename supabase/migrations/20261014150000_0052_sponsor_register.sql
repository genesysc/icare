-- =============================================================================
-- 0052 — Home Office sponsor register (Sponsor check, Phase 1 of the
-- sponsored jobs / news handover, 2026-10-14 — see HANDOVER.md §25).
--
-- Source: GOV.UK "Register of licensed sponsors: workers" CSV, refreshed
-- every working day. Only Route = "Skilled Worker" with a rating starting
-- "Worker (A" is kept (A-rated Skilled Worker licences). The register has
-- no company number, so (name, town) is the identity — normalised by
-- sponsor_key() below, a direct port of the handover's tested Python
-- matcher. "UK" is deliberately NOT stripped: "Barclays Bank UK PLC" and
-- "Barclays Bank PLC" are different legal entities.
--
-- Refresh path (scripts/refresh-sponsor-register.js, GitHub Actions) —
-- staging table + sponsor_refresh_load here; the begin/check/apply/
-- complete steps are in 0053. Same shared-secret SECURITY DEFINER pattern
-- as ingest_news_item() (0048) — no service_role key anywhere. Secret row:
-- app_secrets.key = 'sponsor_refresh_secret'.
--
-- Applied to the live project 2026-10-14 as 0052a–0052e (split up because
-- the Supabase MCP tool timed out on the single combined migration).
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- Port of sponsor_match.py's key(): lowercase, & → and, non-alphanumerics
-- to spaces, drop legal suffixes, collapse whitespace.
create or replace function sponsor_key(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
           regexp_replace(
             regexp_replace(
               replace(lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g')), '&', ' and '),
               '[^a-z0-9 ]', ' ', 'g'),
             '\y(limited|ltd|plc|llp|llc|inc|group|holdings|the)\y', ' ', 'g'),
           '\s+', ' ', 'g'));
$$;

create table register_runs (
  id             uuid primary key default gen_random_uuid(),
  register_date  date not null,
  source_url     text not null,
  status         text not null default 'loading'
                   check (status in ('loading', 'complete', 'failed')),
  -- Unique A-rated Skilled Worker (name, town) sponsors in this register.
  row_count      integer,
  added          integer,
  removed        integer,
  note           text,
  started_at     timestamptz not null default now(),
  run_at         timestamptz
);

create index register_runs_complete_idx on register_runs (register_date desc) where status = 'complete';

create table sponsors (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  town             text not null default '',
  county           text,
  rating           text not null,
  name_key         text not null,
  town_key         text not null,
  -- First register this (name, town) appeared on since iCare started
  -- tracking — feeds "Register watch" (new sponsors this week) later.
  first_seen_date  date not null,
  -- false once the employer drops off the register; row kept for history.
  active           boolean not null default true,
  removed_date     date,
  updated_at       timestamptz not null default now(),
  unique (name_key, town_key)
);

create index sponsors_name_key_trgm_idx on sponsors using gin (name_key extensions.gin_trgm_ops);
create index sponsors_town_key_trgm_idx on sponsors using gin (town_key extensions.gin_trgm_ops);

create table sponsors_staging (
  run_id    uuid not null references register_runs (id) on delete cascade,
  name      text not null,
  town      text not null,
  county    text,
  rating    text not null,
  name_key  text not null,
  town_key  text not null
);

create index sponsors_staging_run_idx on sponsors_staging (run_id);

-- Reading the register requires sign-in (founder decision, 2026-10-14) —
-- any signed-in role, including a candidate who hasn't finished onboarding.
alter table sponsors enable row level security;
create policy sponsors_signed_in_read on sponsors
  for select to authenticated using (active);

alter table register_runs enable row level security;
create policy register_runs_signed_in_read on register_runs
  for select to authenticated using (status = 'complete');

-- No policies at all: only the SECURITY DEFINER refresh functions touch it.
alter table sponsors_staging enable row level security;

revoke all on sponsors, register_runs, sponsors_staging from anon;

-- ---------------------------------------------------------------------------
-- Refresh RPCs (shared-secret gated, callable with the publishable key).
-- ---------------------------------------------------------------------------

create or replace function sponsor_refresh_check_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select value into v_secret from app_secrets where key = 'sponsor_refresh_secret';
  if v_secret is null or p_secret is null or p_secret <> v_secret then
    raise exception 'unauthorized';
  end if;
end;
$$;

revoke all on function sponsor_refresh_check_secret from public, anon, authenticated;

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

  insert into sponsors_staging (run_id, name, town, county, rating, name_key, town_key)
  select p_run_id,
         regexp_replace(btrim(x.name), '\s+', ' ', 'g'),
         regexp_replace(btrim(coalesce(x.town, '')), '\s+', ' ', 'g'),
         nullif(btrim(coalesce(x.county, '')), ''),
         btrim(x.rating),
         sponsor_key(x.name),
         sponsor_key(x.town)
    from jsonb_to_recordset(p_rows) as x(name text, town text, county text, rating text)
   where x.name is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function sponsor_refresh_load from public, authenticated;
grant execute on function sponsor_refresh_load to anon;

-- ---------------------------------------------------------------------------
-- Reads (SECURITY INVOKER — RLS above applies, so signed-in only).
-- ---------------------------------------------------------------------------

-- Search for the Sponsor check page. Every word of the name must appear;
-- the town narrows results, but an exact-name sponsor in a different town
-- is still returned (flagged) so the member can see it and confirm.
--   match = 'exact'      name and town both match
--           'name'       name matches, no town given
--           'other_town' name matches, town differs — confirm the town
--           'partial'    name contains the search words
create or replace function search_sponsors(p_name text, p_town text default null, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, name text, town text, county text, rating text, first_seen_date date, match text, total bigint)
language sql
stable
set search_path = public
as $$
  with q as (
    select sponsor_key(p_name) as nk, sponsor_key(p_town) as tk
  ), words as (
    select array_agg('%' || w || '%') as pats
      from q, unnest(string_to_array(q.nk, ' ')) as w
     where w <> ''
  ), hits as (
    select s.*,
           case
             when s.name_key = q.nk and q.tk <> '' and s.town_key = q.tk then 0
             when s.name_key = q.nk and q.tk = '' then 1
             when s.name_key = q.nk then 2
             when s.name_key like q.nk || '%' then 3
             else 4
           end as rank_
      from sponsors s, q, words
     where s.active
       and length(q.nk) >= 2
       and s.name_key like all (words.pats)
       and (q.tk = '' or s.town_key like '%' || q.tk || '%' or s.name_key = q.nk)
  )
  select h.id, h.name, h.town, h.county, h.rating, h.first_seen_date,
         case h.rank_ when 0 then 'exact' when 1 then 'name' when 2 then 'other_town' else 'partial' end,
         count(*) over ()
    from hits h
   order by h.rank_, h.name, h.town
   limit least(greatest(coalesce(p_limit, 50), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function search_sponsors from public, anon;
grant execute on function search_sponsors to authenticated;

-- Strict matcher for the jobs pipeline (Phase 3) and the acceptance tests:
-- exact name + town → 'exact'; same name, different/missing town →
-- 'name_only' (needs review, never treated as a match); else 'none'.
-- No fuzzy matching here — fuzzy is "needs review", never auto-matched.
create or replace function match_sponsor(p_name text, p_town text default null)
returns table (status text, sponsor_id uuid, name text, town text)
language sql
stable
set search_path = public
as $$
  with q as (select sponsor_key(p_name) as nk, sponsor_key(p_town) as tk),
  exact as (
    select s.id, s.name, s.town from sponsors s, q
     where s.active and q.nk <> '' and q.tk <> '' and s.name_key = q.nk and s.town_key = q.tk
  ),
  name_only as (
    select s.id, s.name, s.town from sponsors s, q
     where s.active and q.nk <> '' and s.name_key = q.nk and not exists (select 1 from exact)
  )
  select 'exact', id, name, town from exact
  union all
  select 'name_only', id, name, town from name_only
  union all
  select 'none', null, null, null where not exists (select 1 from exact) and not exists (select 1 from name_only);
$$;

revoke all on function match_sponsor from public, anon;
grant execute on function match_sponsor to authenticated;
