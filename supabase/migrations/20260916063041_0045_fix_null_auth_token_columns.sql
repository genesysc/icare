-- =============================================================================
-- Fix: password sign-in 500s for any auth.users row with NULL in certain
-- text columns, found 2026-09-15 while live-testing the notification center.
--
-- GoTrue's Go driver scans auth.users' token/change columns
-- (confirmation_token, recovery_token, email_change_token_new,
-- email_change, phone_change, phone_change_token,
-- email_change_token_current, reauthentication_token) into plain Go
-- strings — it cannot scan SQL NULL into one and errors with
-- "converting NULL to string is unsupported", which surfaced as a 500
-- on POST /auth/sign-in-password (password grant does a full user
-- lookup that scans every column; the OTP paths apparently don't touch
-- these the same way, which is why this was invisible until password
-- auth shipped 2026-09-15).
--
-- Confirmed narrow: every REAL account (checked in full) already has
-- '' in these columns, because a real signup goes through GoTrue's own
-- insert path, which sets them correctly. Only the six synthetic
-- `@icare-test.invalid` seed candidates plus one earlier diagnostic
-- account had NULLs — both created by raw SQL insert into auth.users
-- directly, bypassing GoTrue's own defaults. Those seven rows were
-- already hand-fixed live on 2026-09-15 to unblock a specific test; this
-- migration is the durable version: a one-time sweep across every row
-- (harmless no-op for the real accounts, since they're already ''), plus
-- a trigger so this can never quietly recur the next time someone seeds
-- a test account with a raw INSERT instead of a real signup.
-- =============================================================================

update auth.users
set confirmation_token = coalesce(confirmation_token, ''),
    recovery_token = coalesce(recovery_token, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    email_change = coalesce(email_change, ''),
    phone_change = coalesce(phone_change, ''),
    phone_change_token = coalesce(phone_change_token, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    reauthentication_token = coalesce(reauthentication_token, '');

create or replace function public.normalize_auth_user_tokens()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.confirmation_token := coalesce(new.confirmation_token, '');
  new.recovery_token := coalesce(new.recovery_token, '');
  new.email_change_token_new := coalesce(new.email_change_token_new, '');
  new.email_change := coalesce(new.email_change, '');
  new.phone_change := coalesce(new.phone_change, '');
  new.phone_change_token := coalesce(new.phone_change_token, '');
  new.email_change_token_current := coalesce(new.email_change_token_current, '');
  new.reauthentication_token := coalesce(new.reauthentication_token, '');
  return new;
end;
$$;

-- BEFORE, not AFTER (unlike on_auth_user_created/on_auth_user_email_changed
-- in 0002_auth.sql) -- this one has to rewrite NEW itself before the row is
-- written, which only a BEFORE trigger can do. GoTrue's own inserts/updates
-- already set these to '', so this is a no-op for every normal auth
-- operation -- it only ever changes behaviour for a row that would
-- otherwise have written a NULL, which in this project's history has meant
-- "seeded by raw SQL, not through GoTrue."
create trigger on_auth_user_normalize_tokens
  before insert or update on auth.users
  for each row execute function public.normalize_auth_user_tokens();
