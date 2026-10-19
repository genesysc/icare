-- =============================================================================
-- 0059 — Honest community activity (founder, 2026-10-19).
--
-- The founder asked for dummy accounts to make the community look bigger;
-- that was declined (fake members would mislead real candidates and
-- undercut iCare's verified-profiles promise). This migration is the
-- agreed alternative — every item shows something real:
--
--   1. team_posts          "iCare Team" posts in Rounds, always labelled
--                          as staff. Written via the SQL editor / an agent
--                          (no admin UI yet).
--   2. community_stats()   real aggregate counts (open sponsored jobs, new
--                          this week, licensed sponsors, official alerts
--                          this week) — no member count, no per-person data.
--   3. invite_codes /      a personal invite link per member, and a count
--      referrals           of who joined through it. Recorded only when the
--                          new member's own browser claims the code within
--                          2 days of creating their account.
--   4. welcome opt-in      "Welcome Sarah, Nurse in Leeds" in Rounds ONLY
--                          when the member says yes. Default is no
--                          announcement; first name + primary profession +
--                          town only.
-- =============================================================================

-- 1. iCare Team posts -----------------------------------------------------------

create table team_posts (
  id            bigint generated always as identity primary key,
  title         text not null,
  body          text not null,
  link_url      text,
  link_label    text,
  pinned_until  timestamptz,
  is_published  boolean not null default true,
  published_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

alter table team_posts enable row level security;
create policy team_posts_signed_in_read on team_posts
  for select to authenticated using (is_published and published_at <= now());
revoke all on team_posts from anon;

-- 2. Real activity counts --------------------------------------------------------

create or replace function community_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'jobs_open', (select count(*) from sponsored_jobs
                   where status = 'open' and badge_register and (expires_at is null or expires_at > now())),
    'jobs_new_this_week', (select count(*) from sponsored_jobs
                   where status = 'open' and badge_register and (expires_at is null or expires_at > now())
                     and created_at > now() - interval '7 days'),
    'licensed_sponsors', (select row_count from register_runs where status = 'complete'
                           order by register_date desc limit 1),
    'register_date', (select register_date from register_runs where status = 'complete'
                       order by register_date desc limit 1),
    'official_updates_this_week', (select count(*) from rule_alerts where published_at > now() - interval '7 days')
  );
$$;
revoke all on function community_stats from public;
grant execute on function community_stats to anon, authenticated;

-- 3. Invite links ---------------------------------------------------------------

create table invite_codes (
  account_id  uuid primary key references accounts (id),
  code        text not null unique,
  created_at  timestamptz not null default now()
);

create table referrals (
  invitee_id  uuid primary key references accounts (id),
  inviter_id  uuid not null references accounts (id),
  code        text not null,
  created_at  timestamptz not null default now(),
  check (invitee_id <> inviter_id)
);
create index referrals_inviter_idx on referrals (inviter_id);

alter table invite_codes enable row level security;
alter table referrals enable row level security;
-- No policies: read/written only through the functions below.
revoke all on invite_codes, referrals from anon, authenticated;

-- Returns (creating on first call) the caller's invite code and how many
-- people have joined with it.
create or replace function my_invite()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select code into v_code from invite_codes where account_id = auth.uid();
  if v_code is null then
    loop
      v_code := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      begin
        insert into invite_codes (account_id, code) values (auth.uid(), v_code);
        exit;
      exception when unique_violation then
        -- account row raced in, or a code collision: re-read / retry
        select code into v_code from invite_codes where account_id = auth.uid();
        exit when v_code is not null;
      end;
    end loop;
  end if;
  return jsonb_build_object(
    'code', v_code,
    'joined', (select count(*) from referrals where inviter_id = auth.uid())
  );
end;
$$;

-- Called by the NEW member's browser right after sign-up. Only counts if
-- their account is under 2 days old, they haven't already been counted,
-- and it isn't their own code. Silently returns false otherwise.
create or replace function claim_invite(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter uuid;
begin
  if auth.uid() is null then
    return false;
  end if;
  select account_id into v_inviter from invite_codes where code = lower(trim(p_code));
  if v_inviter is null or v_inviter = auth.uid() then
    return false;
  end if;
  if not exists (select 1 from accounts where id = auth.uid() and created_at > now() - interval '2 days') then
    return false;
  end if;
  insert into referrals (invitee_id, inviter_id, code)
  values (auth.uid(), v_inviter, lower(trim(p_code)))
  on conflict (invitee_id) do nothing;
  return found;
end;
$$;

revoke all on function my_invite, claim_invite from public, anon;
grant execute on function my_invite, claim_invite to authenticated;

-- 4. Opt-in welcome announcements -------------------------------------------------

alter table candidates add column if not exists welcome_choice text check (welcome_choice in ('yes', 'no'));
alter table candidates add column if not exists welcome_announced_at timestamptz;

-- Whether to show the "announce me?" card: onboarded candidates who
-- haven't answered yet.
create or replace function my_welcome_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'eligible', coalesce(c.onboarding_done, false),
    'choice', c.welcome_choice
  )
  from candidates c where c.id = auth.uid();
$$;

create or replace function set_welcome_choice(p_announce boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update candidates
     set welcome_choice = case when p_announce then 'yes' else 'no' end,
         welcome_announced_at = case when p_announce then coalesce(welcome_announced_at, now()) else null end
   where id = auth.uid() and onboarding_done;
end;
$$;

-- New members who said yes, last 14 days. Candidates only (same audience
-- boundary as the peer feed). First name, primary profession, town only.
create or replace function recent_member_welcomes()
returns table (candidate_id uuid, first_name text, profession text, town text, announced_at timestamptz, has_profile boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         split_part(btrim(a.full_name), ' ', 1),
         p.name,
         nullif(btrim(c.town), ''),
         c.welcome_announced_at,
         c.is_published
    from candidates c
    join accounts a on a.id = c.id
    left join candidate_professions cp on cp.candidate_id = c.id and cp.is_primary
    left join professions p on p.id = cp.profession_id
   where public.current_role_is('candidate')
     and c.welcome_choice = 'yes'
     and c.welcome_announced_at > now() - interval '14 days'
     and a.status = 'active'
     and btrim(a.full_name) <> ''
   order by c.welcome_announced_at desc
   limit 12;
$$;

revoke all on function my_welcome_status, set_welcome_choice, recent_member_welcomes from public, anon;
grant execute on function my_welcome_status, set_welcome_choice, recent_member_welcomes to authenticated;
