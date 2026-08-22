-- =============================================================================
-- 0002_auth.sql
--
-- Account creation, role assignment and access gating.
--
-- The load-bearing idea: a client can put anything it likes in
-- raw_user_meta_data at sign-up, so nothing in there is trusted. Role is
-- clamped by a trigger, mirrored into app_metadata (which clients cannot
-- write), and locked against later edits. Employer access is gated on
-- is_verified, not on role, so a forged role buys nothing.
-- =============================================================================

create type account_status as enum ('active', 'suspended', 'closed');

alter table accounts
  add column status            account_status not null default 'active',
  add column terms_version     text,
  add column terms_accepted_at timestamptz,
  add column closed_at         timestamptz;

alter table accounts alter column full_name set default '';

-- -----------------------------------------------------------------------------
-- Account provisioning
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role  account_role;
  v_name  text;
  v_org   text;
  v_terms text;
begin
  -- Clamp. 'admin' is unreachable from a sign-up, whatever the client sends.
  v_role := case lower(coalesce(new.raw_user_meta_data->>'signup_role', ''))
              when 'employer' then 'employer'::account_role
              else 'candidate'::account_role
            end;

  v_name  := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), '');
  v_org   := nullif(trim(coalesce(new.raw_user_meta_data->>'org_name',  '')), '');
  v_terms := new.raw_user_meta_data->>'terms_version';

  insert into public.accounts (id, role, full_name, email, terms_version, terms_accepted_at)
  values (
    new.id,
    v_role,
    coalesce(v_name, ''),
    new.email,
    v_terms,
    case when v_terms is not null then now() end
  );

  if v_role = 'candidate' then
    insert into public.candidates (id) values (new.id);
    insert into public.candidate_contact (candidate_id, email) values (new.id, new.email);
  else
    insert into public.employers (id, org_name, is_verified)
    values (new.id, coalesce(v_org, ''), false);

    insert into public.employer_verification_requests (employer_id, submitted_org_name, submitted_email)
    values (new.id, coalesce(v_org, ''), new.email);
  end if;

  -- Mirror the role into app_metadata so it rides in the JWT. Clients cannot
  -- write app_metadata, so middleware can trust it without a database read on
  -- every request.
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || jsonb_build_object('role', v_role::text)
   where id = new.id;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Role immutability
--
-- Nothing short of the service role changes a role. If you ever need to move
-- someone, do it from the Supabase SQL editor and leave a note in
-- account_admin_notes — this is exactly the kind of change an auditor asks
-- about.
-- -----------------------------------------------------------------------------

create or replace function public.lock_account_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'account role is immutable';
  end if;

  -- Email follows auth.users, never a client update.
  if new.email is distinct from old.email and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'email is changed through auth, not directly';
  end if;

  return new;
end;
$$;

create trigger accounts_role_immutable
  before update on accounts
  for each row execute function public.lock_account_role();

-- Keep accounts.email in step when a user changes it through Supabase Auth.
create or replace function public.sync_account_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.accounts set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.sync_account_email();

-- -----------------------------------------------------------------------------
-- Employer verification
-- -----------------------------------------------------------------------------

create table employer_verification_requests (
  id                  uuid primary key default gen_random_uuid(),
  employer_id         uuid not null references employers(id) on delete cascade,
  submitted_org_name  text,
  submitted_email     citext,
  cqc_provider_id     text,
  companies_house_no  text,
  status              evidence_status not null default 'submitted',
  reviewed_by         uuid references accounts(id),
  reviewed_at         timestamptz,
  reviewer_note       text,
  created_at          timestamptz not null default now()
);

create index on employer_verification_requests (status);

-- Helper. security definer so the policies below don't recurse through
-- employers' own RLS.
create or replace function public.is_verified_employer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from employers e
      join accounts  a on a.id = e.id
     where e.id = auth.uid()
       and e.is_verified
       and a.status = 'active'
  );
$$;

create or replace function public.current_role_is(p_role account_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from accounts
     where id = auth.uid() and role = p_role and status = 'active'
  );
$$;

-- Replace the placeholder policy from 0001 — employers now need verification,
-- not merely an employer role.
drop policy if exists candidate_read_published on candidates;

create policy candidate_read_published on candidates
  for select using (is_published and public.is_verified_employer());

drop policy if exists contact_shortlisted on candidate_contact;
create policy contact_shortlisted on candidate_contact
  for select using (
    public.is_verified_employer()
    and exists (
      select 1 from shortlists s
       where s.candidate_id = candidate_contact.candidate_id
         and s.employer_id  = auth.uid()
         and s.candidate_consented_at is not null
    )
  );

drop policy if exists dbs_shortlisted on dbs_records;
create policy dbs_shortlisted on dbs_records
  for select using (
    public.is_verified_employer()
    and exists (
      select 1 from shortlists s
       where s.candidate_id = dbs_records.candidate_id
         and s.employer_id  = auth.uid()
         and s.candidate_consented_at is not null
    )
  );

-- -----------------------------------------------------------------------------
-- Accounts RLS
-- -----------------------------------------------------------------------------

alter table accounts                       enable row level security;
alter table employers                      enable row level security;
alter table employer_verification_requests enable row level security;

create policy accounts_read_self on accounts
  for select using (id = auth.uid());

create policy accounts_update_self on accounts
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy employers_self on employers
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy employer_verification_self on employer_verification_requests
  for select using (employer_id = auth.uid());

create policy employer_verification_insert on employer_verification_requests
  for insert with check (employer_id = auth.uid());

-- Nobody can set their own is_verified. Block it explicitly rather than relying
-- on people remembering not to expose the column.
create or replace function public.lock_employer_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_verified is distinct from old.is_verified
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'verification status is set by review, not by the account holder';
  end if;
  return new;
end;
$$;

create trigger employers_verification_immutable
  before update on employers
  for each row execute function public.lock_employer_verification();

-- -----------------------------------------------------------------------------
-- Account closure (UK GDPR art. 17)
--
-- Soft close first: the profile leaves search immediately, the record survives
-- long enough to satisfy the Conduct Regulations record-keeping duty (one year
-- from the last supply of work-finding services), then a scheduled job purges.
-- -----------------------------------------------------------------------------

create table closure_requests (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references accounts(id) on delete cascade,
  reason       text,
  requested_at timestamptz not null default now(),
  purge_after  date not null default (current_date + interval '12 months'),
  purged_at    timestamptz
);

alter table closure_requests enable row level security;

create policy closure_self on closure_requests
  for all using (account_id = auth.uid()) with check (account_id = auth.uid());

create or replace function public.close_my_account(p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  update accounts   set status = 'closed', closed_at = now() where id = auth.uid();
  update candidates set is_published = false                  where id = auth.uid();

  insert into closure_requests (account_id, reason) values (auth.uid(), p_reason);
end;
$$;

grant execute on function public.close_my_account(text) to authenticated;
