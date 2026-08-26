alter table public.waitlist
  add column role text not null default 'candidate',
  add column org_name text;

alter table public.waitlist
  add constraint waitlist_role_check check (role in ('candidate', 'employer'));

alter table public.waitlist
  add constraint waitlist_employer_org_name_check check (role <> 'employer' or org_name is not null);

create or replace function public.waitlist_count(p_role text default 'candidate')
returns integer
language sql
stable security definer
set search_path to 'public'
as $$
  select count(*)::int from public.waitlist where role = p_role;
$$;
