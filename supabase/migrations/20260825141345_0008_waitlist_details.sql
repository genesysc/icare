alter table public.waitlist
  add column full_name text not null default '',
  add column phone text;

alter table public.waitlist alter column full_name drop default;
