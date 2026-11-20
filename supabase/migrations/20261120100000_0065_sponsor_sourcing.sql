-- =============================================================================
-- 0065 — Sponsor job sourcing (admin-only tool, 2026-11-20).
--
-- Paste company names (already confirmed on the register) -> find website ->
-- find careers page -> extract vacancies -> deterministic rules -> auto-publish
-- passing jobs to the existing board (sponsored_jobs), failures to
-- job_rejections with reasons. Contacts are saved for LATER outreach; nothing
-- here sends email.
--
-- Everything is admin-only: RLS on every new table + SECURITY DEFINER RPCs that
-- check is_app_admin(). The Worker has no service key, it calls with the admin's
-- own login. NOT applied automatically: review, then apply.
-- =============================================================================

-- ---- admin allow-list -------------------------------------------------------
create table if not exists app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table app_admins enable row level security;
-- no policies: nobody reads/writes it through the API; managed in the SQL editor.

create or replace function is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from app_admins where user_id = auth.uid());
$$;
revoke all on function is_app_admin() from public;
grant execute on function is_app_admin() to authenticated;

-- ---- settings ---------------------------------------------------------------
create table if not exists sourcing_settings (
  key        text primary key,
  value      numeric not null,
  updated_at timestamptz not null default now()
);
insert into sourcing_settings (key, value) values
  ('min_hourly_pay', 12.83),
  ('expiry_days', 30),
  ('default_weekly_hours', 37.5),
  ('daily_publish_cap', 50)
on conflict (key) do nothing;

-- ---- batches / companies ----------------------------------------------------
create table if not exists sourcing_batches (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  status      text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  cost_cap    numeric(10, 2) not null default 5,
  cost_used   numeric(10, 2) not null default 0,
  note        text
);

create table if not exists companies (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(name) between 2 and 200),
  name_normalised  text not null unique,
  sponsor_id       uuid references sponsors(id) on delete set null,
  website          text,
  careers_url      text,
  status           text not null default 'queued'
                     check (status in ('queued', 'no_website', 'no_careers_page', 'no_vacancies', 'done', 'needs_a_look')),
  status_detail    text,
  last_checked_at  timestamptz,
  batch_id         uuid references sourcing_batches(id) on delete set null,
  created_at       timestamptz not null default now()
);

create table if not exists company_contacts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  kind        text not null check (kind in ('generic_email', 'named_contact')),
  email       text,
  name        text,
  role        text,
  source_url  text,
  sole_trader boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (company_id, email)
);

create table if not exists contact_suppressions (
  email      text primary key,
  reason     text,
  created_at timestamptz not null default now()
);

create table if not exists job_rejections (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references companies(id) on delete cascade,
  batch_id    uuid references sourcing_batches(id) on delete set null,
  title       text,
  location    text,
  apply_url   text,
  pay_text    text,
  reasons     text[] not null,
  raw         jsonb,
  created_at  timestamptz not null default now()
);

-- ---- extra columns on the existing board table ------------------------------
alter table sponsored_jobs
  add column if not exists company_id        uuid references companies(id) on delete set null,
  add column if not exists hourly_pay        numeric(8, 2),
  add column if not exists last_seen_at      timestamptz,
  add column if not exists sourced           boolean not null default false,
  add column if not exists sponsorship_state text check (sponsorship_state in ('none', 'switch_only', 'new_applicant')),
  add column if not exists sponsorship_note  text;

-- the same company + title + location is one job, however many times it is pasted
create unique index if not exists sponsored_jobs_sourced_uniq
  on sponsored_jobs (company_id, lower(title), lower(coalesce(town, '')))
  where sourced;

-- ---- RLS: admin only --------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['sourcing_settings','sourcing_batches','companies','company_contacts','contact_suppressions','job_rejections'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_admin', t);
    execute format('create policy %I on %I for all to authenticated using (is_app_admin()) with check (is_app_admin())', t || '_admin', t);
  end loop;
end $$;

-- ---- publish a passing job (admin only) -------------------------------------
-- upsert_sponsored_job() is service-role only (0056); this wrapper lets the
-- signed-in admin publish through it and then stamp the sourcing columns.
create or replace function publish_sourced_job(p_company uuid, p_job jsonb, p_extra jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_cap integer;
  v_today integer;
begin
  if not is_app_admin() then raise exception 'forbidden'; end if;

  select value::int into v_cap from sourcing_settings where key = 'daily_publish_cap';
  select count(*) into v_today from sponsored_jobs
   where sourced and created_at >= date_trunc('day', now());
  if v_today >= coalesce(v_cap, 50) then
    return jsonb_build_object('published', false, 'reason', 'daily_cap');
  end if;

  select * into r from upsert_sponsored_job(p_job || jsonb_build_object('source', 'manual'));

  update sponsored_jobs set
    company_id        = p_company,
    sourced           = true,
    hourly_pay        = nullif(p_extra->>'hourly_pay', '')::numeric,
    sponsorship_state = p_extra->>'sponsorship_state',
    sponsorship_note  = p_extra->>'sponsorship_note',
    last_seen_at      = now()
   where id = r.id;

  return jsonb_build_object('published', true, 'id', r.id, 'status', r.status);
end;
$$;
revoke all on function publish_sourced_job from public, anon;
grant execute on function publish_sourced_job to authenticated;
