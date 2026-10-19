-- =============================================================================
-- 0058 — Email info@icareltd.com whenever a new account signs up
-- (founder request, 2026-10-19).
--
-- Flow:
--   1. AFTER INSERT on accounts (every sign-up path — password, code,
--      Google/LinkedIn OAuth, employer — creates exactly one accounts row
--      via handle_new_user()) → pg_net POSTs to the Worker's
--      /internal/signup-alert. pg_net only sends after the sign-up
--      transaction commits, and never blocks or fails the sign-up.
--   2. The Worker claims pending alerts with signup_alerts_claim() (shared
--      secret, same SECURITY DEFINER pattern as the news ingest — no
--      service_role key), emails each one from hello@ to info@ via
--      Sender.net, then marks it sent (or releases it on failure).
--   3. Safety net: pg_cron pings the same endpoint every 15 minutes, but
--      only when something is pending, so a missed/failed ping is retried.
--
-- Claims are atomic (INSERT … ON CONFLICT … WHERE) so the trigger ping and
-- the cron ping can't both email the same sign-up. A claim that's never
-- marked sent (Worker died mid-send) can be re-claimed after 10 minutes.
-- Existing accounts are back-filled as already-sent — no flood on deploy.
--
-- Applied to the live project 2026-10-19 as 0058a (extensions) + 0058b.
--
-- The secret lives only in app_secrets (key 'signup_alert_secret'); the
-- Worker never stores it, it just forwards what the database sent.
-- =============================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

insert into app_secrets (key, value)
values ('signup_alert_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

create table signup_alerts (
  -- No foreign key on purpose: an alert row must never block an account
  -- being closed or removed. Orphans are harmless (7-day window).
  account_id  uuid primary key,
  claimed_at  timestamptz,
  sent_at     timestamptz
);

-- No policies: only the SECURITY DEFINER functions below touch it.
alter table signup_alerts enable row level security;
revoke all on signup_alerts from anon, authenticated;

-- Don't alert about everyone who signed up before this existed.
insert into signup_alerts (account_id, claimed_at, sent_at)
select id, now(), now() from accounts
on conflict (account_id) do nothing;

create or replace function signup_alert_secret_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from app_secrets where key = 'signup_alert_secret' and value = p_secret and p_secret is not null);
$$;
revoke all on function signup_alert_secret_ok from public, anon, authenticated;

-- Claim up to 20 pending sign-ups (last 7 days, not yet sent, not claimed
-- in the last 10 minutes) and return what the email needs.
create or replace function signup_alerts_claim(p_secret text)
returns table (account_id uuid, role text, full_name text, email text, created_at timestamptz, email_confirmed boolean, provider text)
language plpgsql
security definer
set search_path = public, auth
as $$
#variable_conflict use_column
begin
  if not signup_alert_secret_ok(p_secret) then
    raise exception 'unauthorized';
  end if;

  return query
  with cand as (
    select a.id
      from accounts a
      left join signup_alerts s on s.account_id = a.id
     where a.created_at > now() - interval '7 days'
       and (s.account_id is null
            or (s.sent_at is null and (s.claimed_at is null or s.claimed_at < now() - interval '10 minutes')))
     order by a.created_at
     limit 20
  ), claimed as (
    insert into signup_alerts as sa (account_id, claimed_at)
    select id, now() from cand
    on conflict (account_id) do update set claimed_at = now()
     where sa.sent_at is null
       and (sa.claimed_at is null or sa.claimed_at < now() - interval '10 minutes')
    returning sa.account_id
  )
  select a.id, a.role::text, a.full_name, a.email::text, a.created_at,
         u.email_confirmed_at is not null,
         coalesce(u.raw_app_meta_data->>'provider', 'email')
    from claimed c
    join accounts a on a.id = c.account_id
    left join auth.users u on u.id = a.id
   order by a.created_at;
end;
$$;

create or replace function signup_alert_done(p_secret text, p_account_id uuid, p_sent boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not signup_alert_secret_ok(p_secret) then
    raise exception 'unauthorized';
  end if;
  if p_sent then
    update signup_alerts set sent_at = now() where account_id = p_account_id;
  else
    -- Release so the next ping (or the 15-minute cron) retries it.
    update signup_alerts set claimed_at = null where account_id = p_account_id and sent_at is null;
  end if;
end;
$$;

revoke all on function signup_alerts_claim, signup_alert_done from public, authenticated;
grant execute on function signup_alerts_claim, signup_alert_done to anon;

-- Fire-and-forget ping to the Worker. Swallows every error: an alert must
-- never be able to break a sign-up.
create or replace function signup_alert_ping()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select value into v_secret from app_secrets where key = 'signup_alert_secret';
  if v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := 'https://icareltd.com/internal/signup-alert',
    body := jsonb_build_object('secret', v_secret),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 10000
  );
exception when others then
  null;
end;
$$;
revoke all on function signup_alert_ping from public, anon, authenticated;

create or replace function accounts_signup_alert_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform signup_alert_ping();
  return new;
exception when others then
  return new;
end;
$$;
revoke all on function accounts_signup_alert_trigger from public, anon, authenticated;

create trigger accounts_signup_alert
  after insert on accounts
  for each row execute function accounts_signup_alert_trigger();

-- Safety net: every 15 minutes, ping only if something is still pending.
select cron.schedule(
  'signup-alert-catchup',
  '*/15 * * * *',
  $cron$
    select public.signup_alert_ping()
     where exists (
       select 1 from public.accounts a
         left join public.signup_alerts s on s.account_id = a.id
        where a.created_at > now() - interval '7 days'
          and (s.account_id is null or s.sent_at is null)
     );
  $cron$
);
