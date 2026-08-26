create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

-- Anyone can join the waitlist; nobody (not even authenticated users) can
-- read the raw table via the API — emails stay private. A separate
-- SECURITY DEFINER count function exposes just the aggregate count.
create policy waitlist_insert_anyone
  on public.waitlist
  for insert
  to anon, authenticated
  with check (true);

create or replace function public.waitlist_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.waitlist;
$$;

revoke all on function public.waitlist_count() from public;
grant execute on function public.waitlist_count() to anon, authenticated;
