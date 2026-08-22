-- =============================================================================
-- 0003_onboarding.sql
--
-- Turning an account into a profile an employer would actually contact.
--
-- The constraint that shapes everything here: a care worker filling this in on
-- a phone, on a break, between calls. Every field is either a tap or is
-- optional. There is exactly one place they have to type, and even there we
-- give them a question rather than an empty box, because an empty box marked
-- "About me" is where people stop.
-- =============================================================================

alter table candidates
  add column onboarding_step  int  not null default 1,
  add column onboarding_done  boolean not null default false;

-- -----------------------------------------------------------------------------
-- Prompts instead of a blank "About me"
--
-- People who are excellent at this job are routinely bad at describing it.
-- "Tell us about yourself" produces "hardworking and reliable" four hundred
-- times. A specific question produces something an employer can act on.
-- -----------------------------------------------------------------------------

create table prompts (
  id          text primary key,
  label       text not null,
  placeholder text not null,
  sort_order  int  not null default 100,
  active      boolean not null default true
);

insert into prompts (id, label, placeholder, sort_order) values
  ('good_at_not_cv',  'Something I''m good at that isn''t on my CV',
   'e.g. I''m the one they send in when a new client won''t let anyone through the door.', 10),
  ('work_best_with',  'The clients I work best with',
   'e.g. Later-stage dementia. I''m patient and I don''t rush people.', 20),
  ('why_care',        'Why I went into care',
   'e.g. I looked after my nan through a stroke and realised I was good at it.', 30),
  ('proud_moment',    'A moment I''m proud of',
   'e.g. I spotted a pressure sore forming that two other carers had missed.', 40),
  ('need_from_employer','What I need from an employer',
   'e.g. Realistic travel time between calls. I won''t cut a visit short.', 50),
  ('difficult_day',   'How I handle a difficult day',
   'e.g. I finish the round properly, then I ring the office rather than sit on it.', 60);

create table candidate_prompts (
  candidate_id uuid references candidates(id) on delete cascade,
  prompt_id    text references prompts(id),
  answer       text not null,
  updated_at   timestamptz not null default now(),
  primary key (candidate_id, prompt_id)
);

alter table candidate_prompts enable row level security;

create policy prompts_self on candidate_prompts
  for all using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());

create policy prompts_read_published on candidate_prompts
  for select using (
    public.is_verified_employer()
    and exists (select 1 from candidates c
                 where c.id = candidate_prompts.candidate_id and c.is_published)
  );

-- -----------------------------------------------------------------------------
-- Completeness
--
-- Weighted by what employers actually filter on, not by how many boxes are
-- full. A profile with a role, an area and availability is more use than one
-- with a photo and a paragraph.
-- -----------------------------------------------------------------------------

create or replace function public.profile_completeness(p_candidate uuid)
returns int
language sql
stable
as $$
  select least(100, (
      case when exists (select 1 from candidate_professions where candidate_id = p_candidate)
           then 15 else 0 end
    + case when (select postcode_district from candidates where id = p_candidate) is not null
           then 10 else 0 end
    + case when (select availability from candidates where id = p_candidate) is not null
           then 10 else 0 end
    + case when (select right_to_work from candidates where id = p_candidate) <> 'not_stated'
           then 10 else 0 end
    + case when exists (select 1 from employment_history where candidate_id = p_candidate)
           then 20 else 0 end
    + case when exists (select 1 from dbs_records where candidate_id = p_candidate)
           then 10 else 0 end
    + case when exists (select 1 from candidate_prompts where candidate_id = p_candidate)
           then 15 else 0 end
    + case when (select photo_path from candidates where id = p_candidate) is not null
           then 10 else 0 end
  ));
$$;

-- The bar for going live. Deliberately excludes the photo and the written
-- answer: we want people visible early, then nudged, not held at the door.
create or replace function public.can_publish(p_candidate uuid)
returns boolean
language sql
stable
as $$
  select
       exists (select 1 from candidate_professions where candidate_id = p_candidate)
   and exists (select 1 from employment_history    where candidate_id = p_candidate)
   and (select postcode_district from candidates where id = p_candidate) is not null
   and (select right_to_work     from candidates where id = p_candidate) <> 'not_stated';
$$;

create or replace function public.refresh_completeness(p_candidate uuid)
returns void
language plpgsql
as $$
begin
  update candidates
     set completeness = public.profile_completeness(p_candidate),
         updated_at   = now()
   where id = p_candidate;
end;
$$;

create or replace function public.trg_refresh_completeness()
returns trigger language plpgsql as $$
begin
  perform public.refresh_completeness(coalesce(new.candidate_id, old.candidate_id));
  return null;
end;
$$;

create trigger prompts_completeness
  after insert or update or delete on candidate_prompts
  for each row execute function public.trg_refresh_completeness();

create trigger employment_completeness
  after insert or update or delete on employment_history
  for each row execute function public.trg_refresh_completeness();

create trigger professions_completeness
  after insert or update or delete on candidate_professions
  for each row execute function public.trg_refresh_completeness();

create trigger dbs_completeness
  after insert or update or delete on dbs_records
  for each row execute function public.trg_refresh_completeness();

-- Publishing goes through a function, not a client-side update, so the bar
-- can't be bypassed by a request that sets is_published directly.
create or replace function public.publish_my_profile()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public.can_publish(auth.uid()) then return false; end if;

  update candidates
     set is_published   = true,
         published_at   = coalesce(published_at, now()),
         onboarding_done = true,
         completeness   = public.profile_completeness(auth.uid())
   where id = auth.uid();

  -- Award the declared badges the wizard has earned.
  insert into candidate_badges (candidate_id, badge_code, source_table, expires_at)
  select auth.uid(), 'available_now', 'system', now() + interval '30 days'
    from candidates where id = auth.uid() and availability = 'available_now'
  on conflict (candidate_id, badge_code)
    do update set awarded_at = now(), expires_at = now() + interval '30 days';

  insert into candidate_badges (candidate_id, badge_code, source_table)
  select auth.uid(), 'driver', 'system'
    from candidates where id = auth.uid() and has_driving_licence and has_own_vehicle
  on conflict do nothing;

  insert into candidate_badges (candidate_id, badge_code, source_table)
  select auth.uid(), 'sponsorship', 'system'
    from candidates where id = auth.uid() and right_to_work = 'requires_sponsorship'
  on conflict do nothing;

  insert into candidate_badges (candidate_id, badge_code, source_table)
  select auth.uid(), 'dbs_update', 'dbs_records'
    from dbs_records where candidate_id = auth.uid()
     and level in ('enhanced','enhanced_barred') and on_update_service and consent_to_check
  on conflict do nothing;

  perform public.refresh_experience_badges(auth.uid());
  return true;
end;
$$;

grant execute on function public.publish_my_profile() to authenticated;

-- -----------------------------------------------------------------------------
-- Where people give up
--
-- At 400 sign-ups in three days you will not learn this from watching. Log the
-- furthest step each person reached and read it on day two, while you can still
-- change the thing that's losing them.
-- -----------------------------------------------------------------------------

create table onboarding_events (
  id           bigserial primary key,
  candidate_id uuid not null references candidates(id) on delete cascade,
  step         int not null,
  event        text not null,          -- 'entered' | 'completed' | 'skipped'
  at           timestamptz not null default now()
);

create index on onboarding_events (candidate_id, step);

alter table onboarding_events enable row level security;
create policy onboarding_events_self on onboarding_events
  for insert with check (candidate_id = auth.uid());

create view onboarding_funnel as
select step,
       count(distinct candidate_id) filter (where event = 'entered')   as entered,
       count(distinct candidate_id) filter (where event = 'completed') as completed
  from onboarding_events
 group by step
 order by step;
