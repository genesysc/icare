-- =============================================================================
-- 0006_function_privileges.sql
--
-- 0005's "revoke ... from public" didn't close the gap: Supabase projects set
-- default privileges that grant EXECUTE directly to anon/authenticated/
-- service_role on every new function in public, independent of the PUBLIC
-- pseudo-role. Revoke from the actual roles instead.
-- =============================================================================

revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.lock_account_role() from anon, authenticated;
revoke execute on function public.sync_account_email() from anon, authenticated;
revoke execute on function public.lock_employer_verification() from anon, authenticated;

-- current_role_is / is_verified_employer are harmless as anon (auth.uid() is
-- null, so they just return false), but there's no reason a signed-out caller
-- needs the RPC endpoint either.
revoke execute on function public.current_role_is(account_role) from anon;
revoke execute on function public.is_verified_employer() from anon;

-- Candidate self-service actions: authenticated only, never anon.
revoke execute on function public.close_my_account(text) from anon;
revoke execute on function public.publish_my_profile() from anon;
