-- OAuth sign-up has no way to carry signup_role/org_name into
-- raw_user_meta_data the way signInWithOtp/signUp's `data` option does, so
-- handle_new_user() always defaults a brand-new OAuth account to
-- role='candidate' (see its CASE clamp). That default is safe for the
-- common case (candidate OAuth sign-up just works, nothing else needed),
-- but an employer who signed up via "Continue with Google" on the
-- employer page would otherwise be stuck as a candidate with no way to
-- self-correct. This RPC is the narrow, audited fix: it converts a
-- just-created candidate account to an employer account, collecting the
-- org_name that only the human can supply.
--
-- Deliberately NOT a general "change my role" function — guarded to only
-- ever apply to an account created in the last 10 minutes, so it can only
-- complete a signup in progress, never re-role an established candidate
-- with real profile data. security definer is required because a normal
-- authenticated client has no INSERT path onto handle_new_user()'s own
-- territory in a way that also deletes the auto-created candidate rows
-- atomically.
create or replace function public.complete_oauth_employer_signup(p_org_name text, p_terms_version text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_role account_role;
  v_created_at timestamptz;
  v_org text := nullif(trim(coalesce(p_org_name, '')), '');
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select role, created_at into v_role, v_created_at
  from public.accounts
  where id = v_uid;

  if not found then
    raise exception 'no account found for current user';
  end if;

  -- Idempotent: a second click (e.g. a retry) on an account already
  -- converted is a no-op, not an error.
  if v_role = 'employer' then
    return;
  end if;

  if v_role <> 'candidate' then
    raise exception 'unexpected account role for oauth employer conversion';
  end if;

  if v_created_at < now() - interval '10 minutes' then
    raise exception 'this account is too old to convert — sign up for an employer account instead';
  end if;

  delete from public.candidate_contact where candidate_id = v_uid;
  delete from public.candidates where id = v_uid;

  update public.accounts
     set role = 'employer'::account_role,
         terms_version = coalesce(p_terms_version, terms_version),
         terms_accepted_at = case when p_terms_version is not null then now() else terms_accepted_at end
   where id = v_uid;

  insert into public.employers (id, org_name, is_verified)
  values (v_uid, coalesce(v_org, ''), false);

  insert into public.employer_verification_requests (employer_id, submitted_org_name, submitted_email)
  select v_uid, coalesce(v_org, ''), email from public.accounts where id = v_uid;

  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || jsonb_build_object('role', 'employer')
   where id = v_uid;
end;
$$;

revoke all on function public.complete_oauth_employer_signup(text, text) from public;
grant execute on function public.complete_oauth_employer_signup(text, text) to authenticated;
