-- =============================================================================
-- 0063 — One-off "finish your profile" email to members stuck in onboarding
-- (founder, 2026-11-19).
--
-- Not automatic: nothing runs on a schedule. The founder/agent triggers it by
-- calling onboarding_nudge_ping(), which pings the Worker
-- (/internal/onboarding-nudge-ping); the Worker claims a batch with
-- claim_onboarding_nudges() (shared secret, same pattern as 0058 / 0060),
-- emails each member through Sender (transactional, from hello@) and marks
-- them sent. Each member is emailed at most once ever (primary key).
--
-- Who gets it: active candidate accounts that have NOT finished onboarding,
-- signed up more than 24 hours ago, whose email address is CONFIRMED (an
-- unconfirmed address may belong to someone else), and that are not internal
-- or test addresses.
-- =============================================================================

create table onboarding_nudges (
  candidate_id uuid primary key,
  claimed_at   timestamptz,
  sent_at      timestamptz
);

-- No policies: only the SECURITY DEFINER functions below touch it.
alter table onboarding_nudges enable row level security;
revoke all on onboarding_nudges from anon, authenticated;

create or replace function claim_onboarding_nudges(p_secret text, p_limit integer default 20)
returns table (candidate_id uuid, full_name text, email text)
language plpgsql
security definer
set search_path = public, auth
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
  with cand as (
    select a.id
      from accounts a
      join candidates c on c.id = a.id
      join auth.users u on u.id = a.id
      left join onboarding_nudges n on n.candidate_id = a.id
     where a.role = 'candidate'
       and a.status = 'active'
       and not c.onboarding_done
       and a.created_at < now() - interval '24 hours'
       and u.email_confirmed_at is not null
       and a.email::text !~* '(@icare-test\.invalid|@genesysconsultancy\.co\.uk|@icareltd\.com)$'
       and (n.candidate_id is null
            or (n.sent_at is null and (n.claimed_at is null or n.claimed_at < now() - interval '10 minutes')))
     order by a.created_at
     limit least(greatest(coalesce(p_limit, 20), 1), 25)
  ), claimed as (
    insert into onboarding_nudges as o (candidate_id, claimed_at)
    select id, now() from cand
    on conflict (candidate_id) do update set claimed_at = now()
     where o.sent_at is null
       and (o.claimed_at is null or o.claimed_at < now() - interval '10 minutes')
    returning o.candidate_id
  )
  select a.id, a.full_name, a.email::text
    from claimed cl
    join accounts a on a.id = cl.candidate_id
   order by a.created_at;
end;
$$;

create or replace function onboarding_nudge_done(p_secret text, p_candidate_id uuid, p_sent boolean)
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
    update onboarding_nudges set sent_at = now() where candidate_id = p_candidate_id;
  else
    update onboarding_nudges set claimed_at = null where candidate_id = p_candidate_id and sent_at is null;
  end if;
end;
$$;

-- Run by hand (SQL editor / agent): `select onboarding_nudge_ping();` -> the
-- Worker sends one batch of up to 20. Run again for the next batch.
create or replace function onboarding_nudge_ping()
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
    raise exception 'news_ingest_secret is not set';
  end if;
  perform net.http_post(
    url := 'https://icareltd.com/internal/onboarding-nudge-ping',
    body := jsonb_build_object('secret', v_secret),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 10000
  );
end;
$$;

revoke all on function claim_onboarding_nudges, onboarding_nudge_done, onboarding_nudge_ping from public, anon, authenticated;
grant execute on function claim_onboarding_nudges(text, integer) to anon;
grant execute on function onboarding_nudge_done(text, uuid, boolean) to anon;
