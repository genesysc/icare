alter table public.waitlist
  add column hiring_for text;

alter table public.waitlist
  add constraint waitlist_hiring_for_check
  check (hiring_for is null or hiring_for in ('temp', 'permanent', 'both'));
