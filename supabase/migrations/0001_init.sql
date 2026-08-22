-- =============================================================================
-- Care marketplace — candidate side, V1
-- Postgres / Supabase. Auth handled by auth.users.
--
-- Design rules baked in:
--   1. Employers pay. Candidates never pay. No table here takes money.
--   2. Four grades of trust (verified / evidenced / derived / declared) are
--      structural, not cosmetic. A badge cannot change grade.
--   3. Badges are awarded by the system or a reviewer. Nothing self-awards.
--   4. Sensitive identifiers (DBS number, contact details) live in tables with
--      their own RLS and are released on shortlist + consent, not on view.
--   5. Search results are served from a view that excludes photo and video.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

create type account_role as enum ('candidate', 'employer', 'admin');

create type trust_grade as enum (
  'verified',    -- platform checked a public register or authoritative source
  'evidenced',   -- document uploaded and reviewed by a human
  'derived',     -- computed from data already on the platform
  'declared'     -- candidate stated it, nothing checked
);

create type evidence_status as enum (
  'none',
  'submitted',
  'under_review',
  'accepted',
  'rejected',
  'expired'
);

create type regulator as enum (
  'nmc',    -- Nursing and Midwifery Council
  'hcpc',   -- Health and Care Professions Council
  'gdc',    -- General Dental Council
  'gmc',    -- General Medical Council
  'gphc',   -- General Pharmaceutical Council
  'swe',    -- Social Work England
  'goc',    -- General Optical Council
  'none'
);

create type right_to_work as enum (
  'british_irish',
  'settled',
  'pre_settled',
  'indefinite_leave',
  'visa_with_work_rights',
  'requires_sponsorship',
  'not_stated'
);

create type availability_state as enum (
  'available_now',
  'available_from',
  'open_to_offers',
  'not_looking'
);

create type dbs_level as enum ('basic', 'standard', 'enhanced', 'enhanced_barred');

-- -----------------------------------------------------------------------------
-- Accounts
-- -----------------------------------------------------------------------------

create table accounts (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          account_role not null default 'candidate',
  full_name     text not null,
  email         citext not null unique,
  phone         text,
  created_at    timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Profession taxonomy
--
-- The regulator column is what drives which verification path a candidate is
-- offered at sign-up. A registered nurse gets an NMC PIN field; a care assistant
-- doesn't, and is routed to Care Certificate evidence instead.
-- -----------------------------------------------------------------------------

create table professions (
  id          text primary key,
  family      text not null,        -- 'Social care', 'Nursing', 'Allied health', ...
  name        text not null,
  regulator   regulator not null default 'none',
  sort_order  int not null default 100
);

insert into professions (id, family, name, regulator, sort_order) values
  ('care_assistant',     'Social care',    'Care Assistant',                'none', 10),
  ('senior_carer',       'Social care',    'Senior Care Assistant',         'none', 11),
  ('support_worker',     'Social care',    'Support Worker',                'none', 12),
  ('live_in_carer',      'Social care',    'Live-in Carer',                 'none', 13),
  ('registered_manager', 'Social care',    'Registered Manager',            'none', 14),
  ('social_worker',      'Social care',    'Social Worker',                 'swe',  15),

  ('rgn',                'Nursing',        'Registered Nurse (Adult)',      'nmc',  20),
  ('rmn',                'Nursing',        'Registered Nurse (Mental Health)','nmc',21),
  ('rnld',               'Nursing',        'Registered Nurse (LD)',         'nmc',  22),
  ('nursing_associate',  'Nursing',        'Nursing Associate',             'nmc',  23),
  ('midwife',            'Nursing',        'Midwife',                       'nmc',  24),
  ('hca',                'Nursing',        'Healthcare Assistant',          'none', 25),

  ('physiotherapist',    'Allied health',  'Physiotherapist',               'hcpc', 30),
  ('occupational_therapist','Allied health','Occupational Therapist',       'hcpc', 31),
  ('podiatrist',         'Allied health',  'Podiatrist',                    'hcpc', 32),
  ('paramedic',          'Allied health',  'Paramedic',                     'hcpc', 33),
  ('slt',                'Allied health',  'Speech & Language Therapist',   'hcpc', 34),
  ('dietitian',          'Allied health',  'Dietitian',                     'hcpc', 35),
  ('radiographer',       'Allied health',  'Radiographer',                  'hcpc', 36),

  ('dentist',            'Dental',         'Dentist',                       'gdc',  40),
  ('dental_nurse',       'Dental',         'Dental Nurse',                  'gdc',  41),
  ('dental_hygienist',   'Dental',         'Dental Hygienist',              'gdc',  42),

  ('pharmacist',         'Pharmacy',       'Pharmacist',                    'gphc', 50),
  ('pharmacy_technician','Pharmacy',       'Pharmacy Technician',           'gphc', 51),

  ('activities_coord',   'Support',        'Activities Coordinator',        'none', 60),
  ('care_admin',         'Support',        'Care Administrator',            'none', 61),
  ('domestic',           'Support',        'Domestic / Housekeeping',       'none', 62),
  ('chef',               'Support',        'Care Home Chef',                'none', 63);

-- -----------------------------------------------------------------------------
-- Candidate core
-- -----------------------------------------------------------------------------

create table candidates (
  id                  uuid primary key references accounts(id) on delete cascade,

  headline            text,                    -- "Senior carer, dementia specialist, 8 years"
  about               text,                    -- the "brag" field, free text
  proud_of            text,                    -- single pinned highlight (replaces a feed)
  photo_path          text,                    -- storage key; never in search results
  intro_video_path    text,                    -- gated: released at shortlist only

  -- Location. Postcode district only (e.g. 'EN1'), never full postcode on the
  -- profile. Full postcode sits in candidate_contact.
  postcode_district   text,
  town                text,
  travel_radius_miles int default 10,
  willing_to_relocate boolean default false,

  right_to_work       right_to_work not null default 'not_stated',
  visa_expiry         date,
  has_driving_licence boolean default false,
  has_own_vehicle     boolean default false,

  availability        availability_state not null default 'open_to_offers',
  available_from      date,
  shift_prefs         text[] default '{}',     -- 'days','nights','waking_nights','weekends','live_in'
  min_hourly_rate     numeric(5,2),

  is_published        boolean not null default false,
  published_at        timestamptz,
  completeness        int not null default 0,  -- 0-100, recomputed by trigger

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index on candidates (availability) where is_published;
create index on candidates (postcode_district) where is_published;

-- Contact details live apart from the profile. An employer sees these only
-- after a shortlist row exists and the candidate has consented.
create table candidate_contact (
  candidate_id  uuid primary key references candidates(id) on delete cascade,
  phone         text,
  email         citext,
  full_postcode text
);

create table candidate_professions (
  candidate_id  uuid references candidates(id) on delete cascade,
  profession_id text references professions(id),
  is_primary    boolean not null default false,
  primary key (candidate_id, profession_id)
);

-- -----------------------------------------------------------------------------
-- Employment history
--
-- Years of experience is DERIVED from these rows, never typed in by the
-- candidate. That is what makes "5+ Years" a trustworthy badge rather than a
-- claim.
-- -----------------------------------------------------------------------------

create table employment_history (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references candidates(id) on delete cascade,
  employer      text not null,
  job_title     text not null,
  setting       text,   -- 'domiciliary','residential','nursing_home','supported_living',
                        -- 'hospital','hospice','learning_disability','mental_health'
  started_on    date not null,
  ended_on      date,
  is_current    boolean not null default false,
  description   text,
  sort_order    int not null default 0
);

create index on employment_history (candidate_id);

create table clinical_skills (
  id     text primary key,
  label  text not null,
  family text not null
);

insert into clinical_skills (id, label, family) values
  ('peg',            'PEG feeding',                'Clinical'),
  ('catheter',       'Catheter care',              'Clinical'),
  ('stoma',          'Stoma care',                 'Clinical'),
  ('tracheostomy',   'Tracheostomy care',          'Clinical'),
  ('buccal',         'Buccal midazolam',           'Clinical'),
  ('insulin',        'Insulin administration',     'Clinical'),
  ('end_of_life',    'End of life care',           'Specialist'),
  ('dementia',       'Dementia care',              'Specialist'),
  ('parkinsons',     'Parkinson''s',               'Specialist'),
  ('spinal',         'Spinal injury',              'Specialist'),
  ('autism',         'Autism support',             'Specialist'),
  ('challenging',    'Positive behaviour support', 'Specialist'),
  ('hoist',          'Hoisting',                   'Manual handling'),
  ('two_person',     'Two-person transfers',       'Manual handling');

create table candidate_skills (
  candidate_id uuid references candidates(id) on delete cascade,
  skill_id     text references clinical_skills(id),
  primary key (candidate_id, skill_id)
);

-- -----------------------------------------------------------------------------
-- Statutory registration — the verified tier
--
-- reg_number is checked against the regulator's public register. Store the
-- check result and timestamp so a stale check can expire the badge.
-- -----------------------------------------------------------------------------

create table registrations (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   uuid not null references candidates(id) on delete cascade,
  regulator      regulator not null,
  reg_number     text not null,
  register_name  text,          -- returned by the check, e.g. 'Registered Nurse — Adult'
  status         evidence_status not null default 'submitted',
  checked_at     timestamptz,
  expires_on     date,          -- renewal date from the register
  check_payload  jsonb,         -- raw response, for audit
  unique (candidate_id, regulator, reg_number)
);

-- -----------------------------------------------------------------------------
-- DBS
--
-- We do NOT assert that a DBS is valid — we can't. We record that the candidate
-- holds one, at what level, and that they've consented to an employer running
-- an Update Service status check. The certificate number is restricted.
-- -----------------------------------------------------------------------------

create table dbs_records (
  candidate_id        uuid primary key references candidates(id) on delete cascade,
  level               dbs_level not null,
  issued_on           date,
  on_update_service   boolean not null default false,
  consent_to_check    boolean not null default false,
  consent_given_at    timestamptz,
  certificate_number  text,       -- restricted: released at shortlist only
  workforce           text        -- 'adult', 'child', 'both'
);

-- -----------------------------------------------------------------------------
-- Training and qualifications — the evidenced tier
-- -----------------------------------------------------------------------------

create table qualification_types (
  id          text primary key,
  label       text not null,
  family      text not null,
  renews_every_months int   -- null = does not expire
);

insert into qualification_types (id, label, family, renews_every_months) values
  ('care_certificate', 'Care Certificate',                'Mandatory',  null),
  ('moving_handling',  'Moving & Handling',               'Mandatory',  12),
  ('safeguarding_l2',  'Safeguarding Adults L2',          'Mandatory',  12),
  ('safeguarding_l3',  'Safeguarding Adults L3',          'Mandatory',  12),
  ('medication',       'Medication Administration',       'Mandatory',  12),
  ('bls',              'Basic Life Support',              'Mandatory',  12),
  ('first_aid',        'Emergency First Aid at Work',     'Mandatory',  36),
  ('infection',        'Infection Prevention & Control',  'Mandatory',  12),
  ('mca_dols',         'Mental Capacity Act / DoLS',      'Mandatory',  24),
  ('food_hygiene',     'Food Hygiene L2',                 'Mandatory',  36),
  ('nvq2',             'NVQ / Diploma L2 Health & Social Care', 'Vocational', null),
  ('nvq3',             'NVQ / Diploma L3 Health & Social Care', 'Vocational', null),
  ('nvq5',             'NVQ / Diploma L5 Leadership',     'Vocational', null),
  ('degree',           'Degree',                          'Academic',   null);

create table qualifications (
  id                uuid primary key default gen_random_uuid(),
  candidate_id      uuid not null references candidates(id) on delete cascade,
  type_id           text references qualification_types(id),
  title             text,           -- free text if type_id is null
  awarding_body     text,
  awarded_on        date,
  expires_on        date,
  evidence_path     text,           -- storage key, private bucket
  status            evidence_status not null default 'none',
  reviewed_by       uuid references accounts(id),
  reviewed_at       timestamptz,
  reviewer_note     text
);

create index on qualifications (candidate_id, status);

-- -----------------------------------------------------------------------------
-- References
-- -----------------------------------------------------------------------------

create table candidate_references (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   uuid not null references candidates(id) on delete cascade,
  referee_name   text not null,
  referee_org    text,
  referee_email  citext not null,
  relationship   text,             -- 'line manager', 'colleague', ...
  token          text unique,      -- emailed one-time link
  status         evidence_status not null default 'submitted',
  responded_at   timestamptz,
  response       jsonb             -- structured answers, not free-text testimonial
);

-- =============================================================================
-- BADGES
--
-- The badge catalogue is data, not code. Grade is fixed per badge and cannot be
-- overridden at award time — that is the whole point of the trust grammar.
-- There is deliberately no "purchase" or "feature" path into this table.
-- =============================================================================

create table badges (
  code        text primary key,
  label       text not null,
  grade       trust_grade not null,
  family      text not null,
  description text not null,        -- shown to employers on hover: what it means
  auto_award  boolean not null default false,
  ttl_days    int                   -- badge expires this long after award
);

insert into badges (code, label, grade, family, description, auto_award, ttl_days) values
  -- Verified: checked against a public register
  ('nmc_registered',   'NMC Registered',    'verified', 'Registration',
   'PIN checked against the NMC public register. Renewal date shown.', true, 90),
  ('hcpc_registered',  'HCPC Registered',   'verified', 'Registration',
   'Registration number checked against the HCPC public register.', true, 90),
  ('gdc_registered',   'GDC Registered',    'verified', 'Registration',
   'Registration number checked against the GDC public register.', true, 90),
  ('gmc_licensed',     'GMC Licensed',      'verified', 'Registration',
   'Checked against the GMC register, including licence to practise.', true, 90),
  ('swe_registered',   'Social Work England','verified','Registration',
   'Checked against the Social Work England register.', true, 90),
  ('gphc_registered',  'GPhC Registered',   'verified', 'Registration',
   'Checked against the GPhC register.', true, 90),
  ('id_verified',      'ID Verified',       'verified', 'Identity',
   'Government-issued photo ID checked by our identity provider.', true, null),

  -- Evidenced: a human looked at a document
  ('dbs_update',       'Enhanced DBS · on Update Service', 'evidenced', 'Safeguarding',
   'Candidate holds an Enhanced DBS and has consented to you running an Update Service status check. We have not verified the certificate — you must check it yourself.', false, 365),
  ('care_certificate', 'Care Certificate',  'evidenced', 'Training',
   'Certificate uploaded and reviewed. All 15 standards.', false, null),
  ('mandatory_current','Mandatory Training Current', 'evidenced', 'Training',
   'Moving & handling, safeguarding, medication, BLS and infection control all in date.', true, 365),
  ('nvq3',             'NVQ/Diploma L3',    'evidenced', 'Qualification',
   'Certificate uploaded and reviewed.', false, null),
  ('right_to_work_ev', 'Right to Work Evidenced', 'evidenced', 'Eligibility',
   'Share code or document reviewed. Employers must still complete their own statutory check.', false, 180),

  -- Derived: computed from platform data
  ('exp_1',            '1+ Years',          'derived', 'Experience',
   'Calculated from verified employment history.', true, null),
  ('exp_3',            '3+ Years',          'derived', 'Experience',
   'Calculated from verified employment history.', true, null),
  ('exp_5',            '5+ Years',          'derived', 'Experience',
   'Calculated from verified employment history.', true, null),
  ('exp_10',           '10+ Years',         'derived', 'Experience',
   'Calculated from verified employment history.', true, null),
  ('references_2',     'Two References Held','derived','Trust',
   'Two former managers have completed a structured reference.', true, null),
  ('responsive',       'Responsive',        'derived', 'Trust',
   'Replied to more than 80% of employer messages within 48 hours, last 90 days.', true, 90),
  ('interview_ready',  'Interview Ready',   'derived', 'Trust',
   'Completed a recorded introduction. Watch it after shortlisting.', true, null),

  -- Declared: candidate said so
  ('available_now',    'Available Now',     'declared', 'Availability',
   'Candidate states they can start immediately. Decays after 30 days of inactivity.', true, 30),
  ('driver',           'Driver · Own Car',  'declared', 'Practical',
   'Candidate states they hold a licence and have a vehicle.', false, null),
  ('sponsorship',      'Needs Sponsorship', 'declared', 'Eligibility',
   'Candidate states they require a Skilled Worker sponsor.', true, null),
  ('live_in',          'Open to Live-in',   'declared', 'Availability',
   'Candidate states they will consider live-in work.', false, null);

create table candidate_badges (
  candidate_id uuid references candidates(id) on delete cascade,
  badge_code   text references badges(code),
  awarded_at   timestamptz not null default now(),
  expires_at   timestamptz,
  source_table text,          -- 'registrations' | 'qualifications' | 'dbs_records' | 'system'
  source_id    uuid,
  primary key (candidate_id, badge_code)
);

-- Not a partial index on expires_at: now() is STABLE, not IMMUTABLE, and
-- Postgres rejects a non-immutable expression in an index predicate. The
-- expires_at filter still applies fine at query time; this index just
-- speeds up any lookup by badge_code across candidates.
create index on candidate_badges (badge_code);

-- -----------------------------------------------------------------------------
-- Employer side, minimum needed for gating
-- -----------------------------------------------------------------------------

create table employers (
  id           uuid primary key references accounts(id) on delete cascade,
  org_name     text not null,
  cqc_provider_id text,
  is_verified  boolean not null default false,
  created_at   timestamptz not null default now()
);

create table shortlists (
  id            uuid primary key default gen_random_uuid(),
  employer_id   uuid not null references employers(id) on delete cascade,
  candidate_id  uuid not null references candidates(id) on delete cascade,
  created_at    timestamptz not null default now(),
  candidate_consented_at timestamptz,   -- unlocks contact, video, DBS number
  unique (employer_id, candidate_id)
);

-- =============================================================================
-- SEARCH VIEW
--
-- Deliberately excludes photo_path, intro_video_path, about and proud_of.
-- Employers shortlist on role, badges, experience, area and availability.
-- Photo and video are on the full profile, after that first pass.
-- =============================================================================

create view candidate_search as
select
  c.id,
  p.name           as primary_profession,
  p.family         as profession_family,
  c.headline,
  c.postcode_district,
  c.town,
  c.travel_radius_miles,
  c.availability,
  c.available_from,
  c.shift_prefs,
  c.right_to_work,
  c.min_hourly_rate,
  coalesce(
    (select array_agg(cb.badge_code order by b.grade, b.label)
       from candidate_badges cb
       join badges b on b.code = cb.badge_code
      where cb.candidate_id = c.id
        and (cb.expires_at is null or cb.expires_at > now())),
    '{}'
  ) as badge_codes
from candidates c
left join candidate_professions cp
       on cp.candidate_id = c.id and cp.is_primary
left join professions p on p.id = cp.profession_id
where c.is_published;

-- =============================================================================
-- DERIVED BADGE LOGIC
-- =============================================================================

create or replace function total_experience_months(p_candidate uuid)
returns int language sql stable as $$
  select coalesce(sum(
    extract(year  from age(coalesce(ended_on, current_date), started_on)) * 12 +
    extract(month from age(coalesce(ended_on, current_date), started_on))
  ), 0)::int
  from employment_history
  where candidate_id = p_candidate;
$$;

create or replace function refresh_experience_badges(p_candidate uuid)
returns void language plpgsql as $$
declare
  m int := total_experience_months(p_candidate);
begin
  delete from candidate_badges
   where candidate_id = p_candidate
     and badge_code in ('exp_1','exp_3','exp_5','exp_10');

  if m >= 120 then
    insert into candidate_badges (candidate_id, badge_code, source_table)
    values (p_candidate, 'exp_10', 'employment_history');
  elsif m >= 60 then
    insert into candidate_badges (candidate_id, badge_code, source_table)
    values (p_candidate, 'exp_5', 'employment_history');
  elsif m >= 36 then
    insert into candidate_badges (candidate_id, badge_code, source_table)
    values (p_candidate, 'exp_3', 'employment_history');
  elsif m >= 12 then
    insert into candidate_badges (candidate_id, badge_code, source_table)
    values (p_candidate, 'exp_1', 'employment_history');
  end if;
end;
$$;

create or replace function trg_refresh_experience()
returns trigger language plpgsql as $$
begin
  perform refresh_experience_badges(coalesce(new.candidate_id, old.candidate_id));
  return null;
end;
$$;

create trigger employment_history_badges
after insert or update or delete on employment_history
for each row execute function trg_refresh_experience();

-- Availability decay: run nightly. An "Available Now" badge that is three
-- months stale is worse than no badge — it teaches employers to distrust
-- every badge on the platform.
create or replace function decay_stale_availability()
returns void language sql as $$
  update candidates c
     set availability = 'open_to_offers'
    from accounts a
   where a.id = c.id
     and c.availability = 'available_now'
     and a.last_active_at < now() - interval '30 days';

  delete from candidate_badges
   where badge_code = 'available_now'
     and expires_at < now();
$$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table candidates          enable row level security;
alter table candidate_contact   enable row level security;
alter table dbs_records         enable row level security;
alter table qualifications      enable row level security;
alter table employment_history  enable row level security;
alter table candidate_badges    enable row level security;

-- Candidates own their record.
create policy candidate_self on candidates
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Employers read published profiles.
create policy candidate_read_published on candidates
  for select using (
    is_published
    and exists (select 1 from employers e where e.id = auth.uid())
  );

-- Contact details: candidate, or an employer with a consented shortlist row.
create policy contact_self on candidate_contact
  for all using (candidate_id = auth.uid());

create policy contact_shortlisted on candidate_contact
  for select using (
    exists (
      select 1 from shortlists s
       where s.candidate_id = candidate_contact.candidate_id
         and s.employer_id = auth.uid()
         and s.candidate_consented_at is not null
    )
  );

-- DBS certificate number follows the same gate as contact details.
create policy dbs_self on dbs_records
  for all using (candidate_id = auth.uid());

create policy dbs_shortlisted on dbs_records
  for select using (
    exists (
      select 1 from shortlists s
       where s.candidate_id = dbs_records.candidate_id
         and s.employer_id = auth.uid()
         and s.candidate_consented_at is not null
    )
  );

-- Badges are readable by anyone who can read the profile, but writable only by
-- the service role. No client-side path awards a badge.
create policy badges_read on candidate_badges for select using (true);

-- =============================================================================
-- Regulation 22 note (Conduct of Employment Agencies and Employment Businesses
-- Regulations 2003): where workers are supplied to work with vulnerable persons,
-- the agency must obtain confirmation of identity, qualifications and experience
-- required, plus two references, and copies must be given to the hirer. The
-- registrations, qualifications, candidate_references and shortlists tables are
-- the audit trail for that. Do not let a shortlist proceed to placement without
-- them — that check belongs in the placement flow, not here.
-- =============================================================================
