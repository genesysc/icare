-- =============================================================================
-- 0062 — Jobs board: request access, approved by iCare (founder, 2026-11-17).
--
-- Before: any candidate who finished onboarding could open the jobs board.
-- Now: they must also be APPROVED. Flow:
--   1. Member with a finished profile taps "Request access" (request_jobs_access).
--   2. info@ is emailed (pg_net ping -> Worker, 2-hourly cron as safety net)
--      with Approve / Decline links.
--   3. The link opens a confirm page on the Worker; its button calls
--      decide_jobs_access(token). The token is a random 128-bit value stored
--      on the request row — whoever holds the emailed link can decide, so the
--      link only ever goes to info@.
--   4. Approved members are emailed and the board opens (RLS + apply RPC now
--      check candidate_jobs_access()). Declined members see a polite message.
--
-- Existing members are NOT grandfathered: they request like everyone else
-- (10 onboarded, 0 applications at the time of writing). To approve everyone
-- who has finished a profile in one go, see HANDOVER.md §30.
--
-- Same SECURITY DEFINER + shared-secret pattern as 0058 / 0060: no
-- service_role key. Secret checks use `is distinct from` (0061).
-- =============================================================================

create table jobs_board_access (
  -- No foreign key on purpose (same as signup_alerts): a request row must
  -- never block an account from being closed. Orphans are harmless.
  candidate_id  uuid primary key,
  status        text not null default 'requested' check (status in ('requested', 'approved', 'declined')),
  approve_token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  requested_at  timestamptz not null default now(),
  decided_at    timestamptz,
  claimed_at    timestamptz,
  notified_at   timestamptz
);

-- No policies: only the SECURITY DEFINER functions below touch it.
alter table jobs_board_access enable row level security;
revoke all on jobs_board_access from anon, authenticated;

-- Finished profile AND approved.
create or replace function candidate_jobs_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select candidate_onboarding_done()
     and exists (select 1 from jobs_board_access where candidate_id = auth.uid() and status = 'approved');
$$;
revoke all on function candidate_jobs_access from public, anon;
grant execute on function candidate_jobs_access to authenticated;

-- What the page needs to pick the right locked state.
create or replace function my_jobs_access()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'is_candidate', current_role_is('candidate'),
    'onboarded', candidate_onboarding_done(),
    'status', (select status from jobs_board_access where candidate_id = auth.uid())
  );
$$;
revoke all on function my_jobs_access from public, anon;
grant execute on function my_jobs_access to authenticated;

-- The jobs themselves and applying now need approval too.
alter policy sponsored_jobs_member_read on sponsored_jobs
  using (
    status = 'open' and badge_register
    and (expires_at is null or expires_at > now())
    and current_role_is('candidate') and candidate_jobs_access()
  );

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.apply_to_sponsored_job(uuid, text)'::regprocedure) into v_def;
  if position('candidate_onboarding_done()' in v_def) = 0 then
    raise exception 'apply_to_sponsored_job changed shape; update this migration';
  end if;
  execute replace(
    replace(v_def, 'candidate_onboarding_done()', 'candidate_jobs_access()'),
    'Finish your profile to apply', 'Jobs board access is needed to apply'
  );
end;
$$;

-- Ping the Worker so the request email goes out in seconds (the 2-hourly cron
-- is the safety net). Never raises.
create or replace function jobs_access_ping()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select value into v_secret from app_secrets where key = 'news_ingest_secret';
  if v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := 'https://icareltd.com/internal/jobs-access-ping',
    body := jsonb_build_object('secret', v_secret),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 10000
  );
exception when others then
  null;
end;
$$;
revoke all on function jobs_access_ping from public, anon, authenticated;

-- Member taps "Request access". Needs a finished profile.
create or replace function request_jobs_access()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if auth.uid() is null or not (current_role_is('candidate') and candidate_onboarding_done()) then
    raise exception 'Finish your profile to request access' using errcode = '42501';
  end if;
  insert into jobs_board_access (candidate_id) values (auth.uid())
  on conflict (candidate_id) do nothing;
  if found then
    perform jobs_access_ping();
  end if;
  select status into v_status from jobs_board_access where candidate_id = auth.uid();
  return v_status;
end;
$$;
revoke all on function request_jobs_access from public, anon;
grant execute on function request_jobs_access to authenticated;

-- Worker (secret): claim up to 20 un-notified requests for the info@ email.
create or replace function claim_jobs_access_requests(p_secret text)
returns table (
  candidate_id uuid,
  full_name    text,
  email        text,
  profession   text,
  town         text,
  requested_at timestamptz,
  approve_token text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_secret text;
begin
  select value into v_secret from app_secrets where key = 'news_ingest_secret';
  if v_secret is null or p_secret is distinct from v_secret then
    raise exception 'unauthorized';
  end if;

  return query
  with claimed as (
    update jobs_board_access j
       set claimed_at = now()
     where j.candidate_id in (
       select y.candidate_id
         from jobs_board_access y
        where y.status = 'requested'
          and y.notified_at is null
          and (y.claimed_at is null or y.claimed_at < now() - interval '10 minutes')
        order by y.requested_at
        limit 20
        for update skip locked
     )
    returning j.candidate_id, j.requested_at, j.approve_token
  )
  select cl.candidate_id, a.full_name, a.email::text, p.name, nullif(btrim(c.town), ''),
         cl.requested_at, cl.approve_token
    from claimed cl
    join accounts a on a.id = cl.candidate_id
    left join candidates c on c.id = cl.candidate_id
    left join candidate_professions cp on cp.candidate_id = cl.candidate_id and cp.is_primary
    left join professions p on p.id = cp.profession_id
   order by cl.requested_at;
end;
$$;

create or replace function jobs_access_request_done(p_secret text, p_candidate_id uuid, p_sent boolean)
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
  if p_sent then
    update jobs_board_access set notified_at = now() where candidate_id = p_candidate_id;
  else
    update jobs_board_access set claimed_at = null where candidate_id = p_candidate_id and notified_at is null;
  end if;
end;
$$;

-- Confirm page: who does this link belong to, and where does it stand?
create or replace function jobs_access_request_by_token(p_token text)
returns table (full_name text, status text)
language sql
stable
security definer
set search_path = public
as $$
  select a.full_name, j.status
    from jobs_board_access j
    join accounts a on a.id = j.candidate_id
   where p_token is not null and j.approve_token = p_token;
$$;

-- The decision. Approve works from requested or declined (undo a mistake);
-- decline only from requested. `changed` is false when nothing moved (already
-- decided), so a double-click doesn't email the member twice.
create or replace function decide_jobs_access(p_token text, p_approve boolean)
returns table (full_name text, email text, status text, changed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_old text;
  v_new text;
begin
  select j.candidate_id, j.status into v_id, v_old
    from jobs_board_access j
   where p_token is not null and j.approve_token = p_token;
  if v_id is null then
    return;
  end if;

  v_new := case when p_approve then 'approved' else 'declined' end;
  if v_old = v_new or (not p_approve and v_old <> 'requested') then
    v_new := v_old;
  else
    update jobs_board_access set status = v_new, decided_at = now() where candidate_id = v_id;
  end if;

  return query
  select a.full_name, a.email::text, v_new, (v_new is distinct from v_old)
    from accounts a where a.id = v_id;
end;
$$;

revoke all on function claim_jobs_access_requests, jobs_access_request_done,
  jobs_access_request_by_token, decide_jobs_access from public, anon, authenticated;
grant execute on function claim_jobs_access_requests(text) to anon;
grant execute on function jobs_access_request_done(text, uuid, boolean) to anon;
grant execute on function jobs_access_request_by_token(text) to anon;
grant execute on function decide_jobs_access(text, boolean) to anon;
