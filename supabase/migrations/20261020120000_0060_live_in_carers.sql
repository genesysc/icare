-- =============================================================================
-- Live-in Carer Register (HANDOVER: live-in-carers-handover.md, 20 Oct 2026).
--
-- A carer registers where they will work, how long a block they will do and
-- what they charge. Employers see a summary and can invite them to a specific
-- live-in job; full contact details unlock only after the carer accepts, and
-- only while that job's pipeline is open.
--
-- Compliance is encoded here, not in the UI:
--   * no score/rank column exists anywhere, and the summary view has no
--     ordering of its own — the API sorts by updated_at only (non-negotiable
--     #1/#5: nothing may rank or score a candidate).
--   * full_name/email/phone/postcode are in the base table only; every
--     employer-readable view excludes them until an accepted invite exists.
--   * dbs_state has exactly three allowed values and no client write path —
--     moving it is a staff action (confirm_live_in_dbs_state, not granted to
--     authenticated). A certificate number alone cannot move it.
--   * consent is three separate append-only rows, each timestamped with the
--     text version, never bundled.
--   * access auto-revokes because the detail view requires the job to still
--     be `active`; closing a job removes access without a cron or cleanup.
--
-- Same pattern as 0055_rule_alerts: SECURITY DEFINER for anything that has to
-- cross the RLS boundary, no service_role key anywhere. No destructive DDL
-- (DROP/TRUNCATE/ALTER COLUMN) in this file, so it can be applied unattended;
-- DELETEs appear only inside function bodies, never at apply time.
-- =============================================================================

create table live_in_carers (
  id                    uuid primary key default gen_random_uuid(),
  -- Existing iCare account only. A live-in profile is not a second account
  -- system: no anonymous rows, no profile without a signed-in user.
  user_id               uuid not null unique references accounts(id) on delete cascade,
  full_name             text not null,
  preferred_name        text,
  email                 text not null,
  phone                 text not null,
  role                  text not null check (role in ('care-assistant', 'senior-care-worker', 'nurse-hca', 'other')),
  experience            text not null check (experience in ('<1y', '1-3y', '3-5y', '5-10y', '10y+')),
  live_in_experience    text not null check (live_in_experience in ('yes-regular', 'yes-few', 'no-keen')),
  specialisms           text[] not null default '{}',
  languages             text,
  regions               text[] not null,
  postcode_private      text not null,
  -- Outward district only, the one location value an employer may ever see.
  postcode_area         text not null,
  radius                text not null check (radius in ('10', '25', '50', '100', 'uk')),
  blocks                text[] not null,
  start_date            date not null,
  time_off              text check (time_off in ('same-as-block', 'half-block', 'flexible')),
  rate_basis            text not null check (rate_basis in ('day', '24h', 'week')),
  -- Pence, integer. Never a float (acceptance criterion).
  rate_pence            integer not null check (rate_pence >= 0),
  rate_negotiable       text check (rate_negotiable in ('fixed', 'open', 'depends-on-block')),
  rate_notes            text,
  accommodation         text not null check (accommodation in ('own-room', 'shared-ok')),
  rtw                   text not null check (rtw in ('yes', 'existing-visa', 'no-or-unsure')),
  visibility            text not null default 'public' check (visibility in ('public', 'hidden')),
  alert_frequency       text not null default 'off' check (alert_frequency in ('as-they-happen', 'weekly', 'off')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,

  constraint live_in_carers_regions_known check (
    coalesce(array_length(regions, 1), 0) >= 1
    and regions <@ array['london', 'south-east', 'east', 'midlands', 'north-west',
                        'north-east', 'south-west', 'wales', 'scotland',
                        'northern-ireland']::text[]
  ),
  constraint live_in_carers_blocks_known check (
    coalesce(array_length(blocks, 1), 0) >= 1
    and blocks <@ array['1w', '2w', '4w', '8w+', 'ongoing', 'short-cover']::text[]
  ),
  constraint live_in_carers_specialisms_known check (
    specialisms <@ array['dementia', 'end-of-life', 'mobility', 'learning-disability',
                        'mental-health', 'childrens']::text[]
  ),
  -- Alerts are only meaningful when the carer opted in. Keeps the two
  -- independent fields honest with each other without bundling the consent.
  constraint live_in_carers_alert_consistency check (
    alert_frequency = 'off' or visibility = 'public'
  )
);

create index live_in_carers_regions_idx on live_in_carers using gin (regions);
create index live_in_carers_blocks_idx on live_in_carers using gin (blocks);
create index live_in_carers_updated_idx on live_in_carers (updated_at desc);

-- DBS state, strictly the three approved strings (non-negotiable #3):
-- "Not Yet Verified" / "Current: no new information" / "New information
-- reported". Never "verified" or "clean" — the DB has no such value.
create table live_in_dbs (
  carer_id                   uuid primary key references live_in_carers(id) on delete cascade,
  dbs_state                  text not null default 'not_yet_verified'
                               check (dbs_state in ('not_yet_verified', 'current', 'new_info')),
  dbs_check_date             date,
  certificate_number_private text,
  updated_at                 timestamptz not null default now()
);

-- Append-only consent history. A withdrawal is a new row with granted=false
-- and withdrawn_at set; the newest row for a type is authoritative.
create table live_in_consents (
  id             uuid primary key default gen_random_uuid(),
  carer_id       uuid not null references live_in_carers(id) on delete cascade,
  consent_type   text not null check (consent_type in ('privacy', 'employer_view', 'email_alerts')),
  granted        boolean not null,
  text_version   text not null,
  granted_at     timestamptz,
  withdrawn_at   timestamptz,
  source         text not null check (source in ('web_form', 'account_page')),
  created_at     timestamptz not null default now()
);

create index live_in_consents_carer_idx on live_in_consents (carer_id, consent_type, created_at desc);

-- A formal invite tied to a real job is the consent event (same principle as
-- shortlists). Name/contact unlock only once status = 'accepted' and the job
-- is still active.
create table live_in_invites (
  id            uuid primary key default gen_random_uuid(),
  carer_id      uuid not null references live_in_carers(id) on delete cascade,
  job_id        uuid not null references jobs(id) on delete cascade,
  employer_id   uuid not null references employers(id) on delete cascade,
  status        text not null default 'sent'
                  check (status in ('sent', 'accepted', 'declined', 'expired', 'revoked')),
  message       text,
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  unique (carer_id, job_id)
);

create index live_in_invites_carer_idx on live_in_invites (carer_id, created_at desc);
create index live_in_invites_employer_idx on live_in_invites (employer_id, created_at desc);

-- Alert ledger. unique(carer_id, job_id) is the "never send the same role
-- twice" acceptance criterion; sent_at stays null until the cron claims it.
create table live_in_alert_sends (
  id          uuid primary key default gen_random_uuid(),
  carer_id    uuid not null references live_in_carers(id) on delete cascade,
  job_id      uuid not null references jobs(id) on delete cascade,
  channel     text not null check (channel in ('instant', 'weekly')),
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  unique (carer_id, job_id)
);

create index live_in_alert_sends_pending_idx on live_in_alert_sends (sent_at) where sent_at is null;

-- ---------------------------------------------------------------------------
-- Helpers (security definer so policies/views don't recurse through RLS)
-- ---------------------------------------------------------------------------

create or replace function public.live_in_self(p_carer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from live_in_carers
     where id = p_carer_id and user_id = auth.uid()
  );
$$;

-- Newest consent row for a type wins. Missing history = not granted.
create or replace function public.live_in_consent_granted(p_carer_id uuid, p_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select c.granted
      from live_in_consents c
     where c.carer_id = p_carer_id
       and c.consent_type = p_type
     order by c.created_at desc
     limit 1
  ), false);
$$;

-- An employer cannot read live_in_carers under RLS, so the invite policy
-- checks the carer through this definer helper (an inline subquery would see
-- no rows and reject every invite).
create or replace function public.live_in_carer_invitable(p_carer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from live_in_carers c
     where c.id = p_carer_id
       and c.deleted_at is null
       and c.visibility = 'public'
       and public.live_in_consent_granted(c.id, 'employer_view')
  );
$$;

create or replace function public.touch_live_in_carer()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger live_in_carers_touch
before update on live_in_carers
for each row execute function public.touch_live_in_carer();

-- A carer may only answer an invite. Job, employer and carer ids are fixed at
-- creation, and a response is final (accepted -> declined is not allowed).
-- Direct client updates (role authenticated/anon) may only move a 'sent'
-- invite to 'accepted' or 'declined', stamping responded_at — never revive a
-- revoked/expired invite. The SECURITY DEFINER revoke functions run as the
-- function owner, so they can still set 'revoked'.
create or replace function public.guard_live_in_invite()
returns trigger
language plpgsql
as $$
begin
  if new.carer_id <> old.carer_id
     or new.job_id <> old.job_id
     or new.employer_id <> old.employer_id
     or new.created_at <> old.created_at
     or new.message is distinct from old.message then
    raise exception 'Only the invite response can be changed';
  end if;
  if old.responded_at is not null and new.status <> old.status then
    raise exception 'This invite has already been answered';
  end if;
  if current_user in ('authenticated', 'anon') then
    if old.status <> 'sent'
       or new.status not in ('accepted', 'declined')
       or new.responded_at is null then
      raise exception 'This invite can no longer be answered';
    end if;
  end if;
  return new;
end;
$$;

create trigger live_in_invites_guard
before update on live_in_invites
for each row execute function public.guard_live_in_invite();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table live_in_carers enable row level security;
alter table live_in_dbs enable row level security;
alter table live_in_consents enable row level security;
alter table live_in_invites enable row level security;
alter table live_in_alert_sends enable row level security;

create policy live_in_carers_self_read on live_in_carers
  for select using (user_id = auth.uid());

create policy live_in_carers_self_insert on live_in_carers
  for insert with check (user_id = auth.uid() and public.current_role_is('candidate'));

create policy live_in_carers_self_update on live_in_carers
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy live_in_dbs_self_read on live_in_dbs
  for select using (public.live_in_self(carer_id));

create policy live_in_consents_self_read on live_in_consents
  for select using (public.live_in_self(carer_id));

create policy live_in_consents_self_insert on live_in_consents
  for insert with check (public.live_in_self(carer_id));

create policy live_in_invites_carer_read on live_in_invites
  for select using (public.live_in_self(carer_id));

create policy live_in_invites_carer_respond on live_in_invites
  for update using (public.live_in_self(carer_id))
  with check (public.live_in_self(carer_id));

create policy live_in_invites_employer_read on live_in_invites
  for select using (employer_id = auth.uid() and public.is_verified_employer());

create policy live_in_invites_employer_insert on live_in_invites
  for insert with check (
    employer_id = auth.uid()
    and status = 'sent'
    and responded_at is null
    and public.is_verified_employer()
    and exists (
      select 1 from jobs j
       where j.id = job_id
         and j.employer_id = auth.uid()
         and j.status = 'active'
    )
    and public.live_in_carer_invitable(carer_id)
  );

-- No policies at all on live_in_alert_sends: the cron path is secret-gated
-- SECURITY DEFINER, and the enqueue function below is the only writer.

-- ---------------------------------------------------------------------------
-- Employer-readable views
--
-- Column grants/views, not app-level filtering: an employer querying the
-- base table gets nothing, because no table policy grants it.
-- ---------------------------------------------------------------------------

create or replace view live_in_carer_summaries as
select
  c.id,
  coalesce(nullif(btrim(c.preferred_name), ''), 'Live-in carer') as display_name,
  c.role,
  c.experience,
  c.live_in_experience,
  c.specialisms,
  c.languages,
  c.regions,
  c.postcode_area,
  c.radius,
  c.blocks,
  c.start_date,
  c.time_off,
  c.rate_basis,
  c.rate_pence,
  c.rate_negotiable,
  c.rate_notes,
  c.accommodation,
  d.dbs_state,
  d.dbs_check_date,
  c.updated_at
from live_in_carers c
left join live_in_dbs d on d.carer_id = c.id
where c.deleted_at is null
  and c.visibility = 'public'
  and public.is_verified_employer()
  and public.live_in_consent_granted(c.id, 'employer_view');

-- Full profile for an employer only while an accepted invite exists for a
-- job they own and that job is still active. Closing the job revokes this
-- with no cleanup step. postcode_private and the certificate number are
-- never in this view, even here.
create or replace view live_in_carer_details as
select
  c.id,
  c.full_name,
  c.preferred_name,
  c.email,
  c.phone,
  c.role,
  c.experience,
  c.live_in_experience,
  c.specialisms,
  c.languages,
  c.regions,
  c.postcode_area,
  c.radius,
  c.blocks,
  c.start_date,
  c.time_off,
  c.rate_basis,
  c.rate_pence,
  c.rate_negotiable,
  c.rate_notes,
  c.accommodation,
  c.rtw,
  d.dbs_state,
  d.dbs_check_date,
  c.updated_at
from live_in_carers c
left join live_in_dbs d on d.carer_id = c.id
where c.deleted_at is null
  and public.is_verified_employer()
  and exists (
    select 1
      from live_in_invites i
      join jobs j on j.id = i.job_id
     where i.carer_id = c.id
       and i.status = 'accepted'
       and j.employer_id = auth.uid()
       and j.status = 'active'
  );

-- Carer's own invite list. A view rather than an embed because `jobs` has no
-- candidate read policy: an embed would silently return null job details. Only
-- the fields a carer needs to answer the invite are exposed.
create or replace view live_in_carer_invites as
select
  i.id,
  i.carer_id,
  i.job_id,
  i.status,
  i.message,
  i.created_at,
  i.responded_at,
  j.title,
  j.location,
  j.pay_range,
  j.status as job_status
from live_in_invites i
join jobs j on j.id = i.job_id
where public.live_in_self(i.carer_id);

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------

-- Certificate number only. Deliberately cannot touch dbs_state: a number (or
-- a number plus an upload) leaves the carer at "Not Yet Verified" per the
-- handover's strict DBS rule.
create or replace function public.submit_live_in_dbs_number(p_certificate_number text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_carer_id uuid;
  v_number text;
begin
  select id into v_carer_id from live_in_carers where user_id = auth.uid() and deleted_at is null;
  if v_carer_id is null then
    raise exception 'No live-in profile for this account';
  end if;

  v_number := nullif(btrim(p_certificate_number), '');

  insert into live_in_dbs (carer_id, certificate_number_private)
  values (v_carer_id, v_number)
  on conflict (carer_id) do update
    set certificate_number_private = excluded.certificate_number_private,
        updated_at = now();
end;
$$;

-- Staff-only. Not granted to authenticated/anon: the state can only move
-- through the DBS Update Service check or a manual staff confirmation.
create or replace function public.confirm_live_in_dbs_state(
  p_carer_id uuid,
  p_state text,
  p_check_date date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_state not in ('not_yet_verified', 'current', 'new_info') then
    raise exception 'Unknown DBS state';
  end if;
  insert into live_in_dbs (carer_id, dbs_state, dbs_check_date)
  values (p_carer_id, p_state, p_check_date)
  on conflict (carer_id) do update
    set dbs_state = excluded.dbs_state,
        dbs_check_date = excluded.dbs_check_date,
        updated_at = now();
end;
$$;

-- Fails the registration cleanly when the consent rows cannot be written, so a
-- profile can never exist without its consent history. Deliberately narrow:
-- own row, zero consents only, and there is no general DELETE policy.
create or replace function public.discard_live_in_profile(p_carer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from live_in_carers c
   where c.id = p_carer_id
     and c.user_id = auth.uid()
     and not exists (select 1 from live_in_consents x where x.carer_id = c.id);
end;
$$;

-- Employer-side closure. Without this the invite rows would stay 'sent' after
-- a job closes and the carer's page would keep showing an actionable invite.
-- Ownership is checked here rather than through an employer UPDATE policy,
-- which would also let an employer mark their own invite 'accepted'.
create or replace function public.revoke_live_in_invites_for_job(p_job_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not exists (
    select 1 from jobs
     where id = p_job_id
       and employer_id = auth.uid()
  ) then
    raise exception 'unauthorized';
  end if;

  update live_in_invites
     set status = 'revoked'
   where job_id = p_job_id
     and status = 'sent';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Called by the Worker immediately after a live-in job is created or edited.
-- Matching is regions + blocks only (founder decision, 2026-10-20): radius is
-- stored and shown, but not used until a geocoder is added.
create or replace function public.enqueue_live_in_alerts(p_job_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job record;
  v_count integer;
begin
  select id, employer_id, status, live_in_regions, live_in_blocks
    into v_job
    from jobs
   where id = p_job_id;

  if v_job.id is null then
    raise exception 'Unknown job';
  end if;
  if v_job.employer_id <> auth.uid() or not public.is_verified_employer() then
    raise exception 'unauthorized';
  end if;
  if v_job.status <> 'active'
     or coalesce(array_length(v_job.live_in_regions, 1), 0) = 0
     or coalesce(array_length(v_job.live_in_blocks, 1), 0) = 0 then
    return 0;
  end if;

  with matched as (
    insert into live_in_alert_sends (carer_id, job_id, channel)
    select c.id,
           p_job_id,
           case when c.alert_frequency = 'weekly' then 'weekly' else 'instant' end
      from live_in_carers c
     where c.deleted_at is null
       and c.visibility = 'public'
       and c.alert_frequency <> 'off'
       and public.live_in_consent_granted(c.id, 'email_alerts')
       and c.regions && v_job.live_in_regions
       and c.blocks && v_job.live_in_blocks
    on conflict (carer_id, job_id) do nothing
    returning 1
  )
  select count(*) into v_count from matched;

  return v_count;
end;
$$;

-- Cron-only. Reuses the existing internal Worker secret (the same one the
-- news ingest uses) rather than introducing a second secret the deploy would
-- silently depend on. Claims rows by stamping sent_at, so a role can never be
-- claimed twice even if two cron runs overlap; release_live_in_alert() puts
-- a row back if the email then fails to send.
--
-- Eligibility is re-checked here, not only at enqueue: a carer who has since
-- switched alerts off, withdrawn email consent, hidden or deleted their
-- profile is skipped (row marked sent, nothing emailed). 'weekly' rows are
-- only claimed on Mondays (UK time); the Worker groups them into one email.
create or replace function public.claim_live_in_alerts(p_secret text)
returns table (
  carer_id     uuid,
  job_id       uuid,
  to_email     text,
  display_name text,
  job_title    text,
  job_location text,
  pay_range    text,
  start_date   date,
  blocks       text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select value into v_secret from app_secrets where key = 'news_ingest_secret';
  if v_secret is null or p_secret is distinct from v_secret then
    raise exception 'unauthorized';
  end if;

  return query
  with claimed as (
    update live_in_alert_sends s
       set sent_at = now()
     where s.id in (
       select s2.id
         from live_in_alert_sends s2
        where s2.sent_at is null
          and (s2.channel = 'instant'
               or extract(isodow from now() at time zone 'Europe/London') = 1)
        order by s2.created_at
        limit 200
        for update skip locked
     )
    returning s.carer_id, s.job_id
  )
  select c.id,
         j.id,
         c.email,
         coalesce(nullif(btrim(c.preferred_name), ''), 'there'),
         j.title,
         j.location,
         j.pay_range,
         c.start_date,
         j.live_in_blocks
    from claimed cl
    join live_in_carers c on c.id = cl.carer_id
    join jobs j on j.id = cl.job_id
   where c.deleted_at is null
     and c.visibility = 'public'
     and c.alert_frequency <> 'off'
     and public.live_in_consent_granted(c.id, 'email_alerts')
     and j.status = 'active';
end;
$$;

-- Cron/Worker-only: un-claim one alert whose email failed, so the next cron
-- run retries it.
create or replace function public.release_live_in_alert(p_secret text, p_carer_id uuid, p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select value into v_secret from app_secrets where key = 'news_ingest_secret';
  if v_secret is null or p_secret is distinct from v_secret then
    raise exception 'unauthorized';
  end if;
  update live_in_alert_sends
     set sent_at = null
   where carer_id = p_carer_id and job_id = p_job_id;
end;
$$;

-- Cron/Worker-only: the invite notification needs the carer's email, which the
-- employer must never be able to read. Secret-gated for the same reason as
-- claim_live_in_alerts, and only for an invite that already exists.
create or replace function public.live_in_invite_recipient(p_secret text, p_invite_id uuid)
returns table (
  to_email     text,
  display_name text,
  job_title    text,
  job_location text,
  org_name     text,
  message      text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select value into v_secret from app_secrets where key = 'news_ingest_secret';
  if v_secret is null or p_secret is distinct from v_secret then
    raise exception 'unauthorized';
  end if;

  return query
  select c.email,
         coalesce(nullif(btrim(c.preferred_name), ''), 'there'),
         j.title,
         j.location,
         e.org_name,
         i.message
    from live_in_invites i
    join live_in_carers c on c.id = i.carer_id
    join jobs j on j.id = i.job_id
    join employers e on e.id = i.employer_id
   where i.id = p_invite_id
     and i.status = 'sent'
     and c.deleted_at is null;
end;
$$;

-- Soft delete. Views stop returning the row immediately, alerts stop matching,
-- and invites are revoked. Hard-deletion of retained rows is pending the
-- legal retention decision (handover open question 7).
create or replace function public.delete_my_live_in_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_carer_id uuid;
begin
  select id into v_carer_id from live_in_carers where user_id = auth.uid() and deleted_at is null;
  if v_carer_id is null then return; end if;

  update live_in_carers
     set deleted_at = now(), visibility = 'hidden', alert_frequency = 'off'
   where id = v_carer_id;

  update live_in_invites
     set status = 'revoked'
   where carer_id = v_carer_id and status = 'sent';

  delete from live_in_alert_sends where carer_id = v_carer_id and sent_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on live_in_carers from anon;
revoke all on live_in_dbs from anon;
revoke all on live_in_consents from anon;
revoke all on live_in_invites from anon;
revoke all on live_in_alert_sends from anon;

grant select, insert, update on live_in_carers to authenticated;
grant select on live_in_dbs to authenticated;
grant select, insert on live_in_consents to authenticated;
grant select, insert, update on live_in_invites to authenticated;

grant select on live_in_carer_summaries to authenticated;
grant select on live_in_carer_details to authenticated;
grant select on live_in_carer_invites to authenticated;

revoke all on function public.discard_live_in_profile(uuid) from public, anon;
grant execute on function public.discard_live_in_profile(uuid) to authenticated;

revoke all on function public.revoke_live_in_invites_for_job(uuid) from public, anon;
grant execute on function public.revoke_live_in_invites_for_job(uuid) to authenticated;

revoke all on function public.submit_live_in_dbs_number(text) from public;
grant execute on function public.submit_live_in_dbs_number(text) to authenticated;

revoke all on function public.confirm_live_in_dbs_state(uuid, text, date) from public, anon, authenticated;

revoke all on function public.enqueue_live_in_alerts(uuid) from public, anon;
grant execute on function public.enqueue_live_in_alerts(uuid) to authenticated;

revoke all on function public.claim_live_in_alerts(text) from public, anon, authenticated;
grant execute on function public.claim_live_in_alerts(text) to anon;

revoke all on function public.release_live_in_alert(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_live_in_alert(text, uuid, uuid) to anon;

revoke all on function public.live_in_invite_recipient(text, uuid) from public, anon, authenticated;
grant execute on function public.live_in_invite_recipient(text, uuid) to anon;

revoke all on function public.delete_my_live_in_profile() from public, anon;
grant execute on function public.delete_my_live_in_profile() to authenticated;

-- Live-in terms on jobs. Without these the alert matcher has nothing to match
-- on: the existing jobs table only has free-text `location`. Nullable so
-- every existing non-live-in job is untouched.
alter table jobs
  add column live_in_regions text[],
  add column live_in_blocks text[];

alter table jobs add constraint jobs_live_in_regions_known check (
  live_in_regions is null
  or live_in_regions <@ array['london', 'south-east', 'east', 'midlands', 'north-west',
                              'north-east', 'south-west', 'wales', 'scotland',
                              'northern-ireland']::text[]
);

alter table jobs add constraint jobs_live_in_blocks_known check (
  live_in_blocks is null
  or live_in_blocks <@ array['1w', '2w', '4w', '8w+', 'ongoing', 'short-cover']::text[]
);
