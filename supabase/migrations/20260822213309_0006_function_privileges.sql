revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.lock_account_role() from anon, authenticated;
revoke execute on function public.sync_account_email() from anon, authenticated;
revoke execute on function public.lock_employer_verification() from anon, authenticated;

revoke execute on function public.current_role_is(account_role) from anon;
revoke execute on function public.is_verified_employer() from anon;

revoke execute on function public.close_my_account(text) from anon;
revoke execute on function public.publish_my_profile() from anon;
