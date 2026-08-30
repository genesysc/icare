-- =============================================================================
-- Sprint 13 — Jobs module.
--
-- HANDOVER.md §14 / SPRINTS.md "Employer-track reconciliation, 2026-08-30":
-- the B2B workflow handover, the wireframes, and the Next.js reference
-- app's lib/types.ts all independently require a job record before any
-- invite can be sent — not to reopen the "no job postings" decision (jobs
-- here are never public, never browsable, never candidate-facing, have no
-- apply button) but because a valid consent request has to be specific and
-- informed (UK GDPR) and carry position details before introduction
-- (Conduct Regulations 2003). Free-texting this into every invite would be
-- inconsistent and likely to omit required fields, pay in particular.
--
-- Field split matches the CV-parser propose/confirm pattern: description_body
-- is the one AI-drafted field (drafted from title + the structured fields
-- below via Workers AI, same as CV import — see src/jobs.ts), everything
-- else is explicit, required employer input. The employer can accept an
-- AI-suggested default but must explicitly confirm before it saves — never
-- silently auto-filled and sent, same rule as CV import's non-negotiable #5.
--
-- Sprint 14 will add the hard gate itself (Send Invite requires a job_id);
-- this migration only makes job records creatable/listable/closeable.
-- =============================================================================

create table jobs (
  id                      uuid primary key default gen_random_uuid(),
  employer_id             uuid not null references employers(id) on delete cascade,
  title                   text not null,
  profession_id           text not null references professions(id),
  location                text not null,
  pay_range               text not null,
  hours                   text not null,
  contract_type           text not null check (contract_type in ('permanent', 'fixed_term', 'locum', 'bank')),
  notice_period           text,
  qualifications_required text,
  health_safety_risks     text,
  -- Mandatory, three-state — not a binary Yes/No. A flat toggle either hides
  -- the transitional-arrangement case or lets an employer imply new-overseas
  -- sponsorship is available when it isn't (workflow handover §3).
  sponsorship_offered     text not null check (sponsorship_offered in ('none', 'transitional_switch_only', 'new_applicant')),
  description_body        text,
  status                  text not null default 'active' check (status in ('active', 'closed')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Non-negotiable #8 (immigration): overseas sponsorship for Care Worker and
-- Senior Care Worker roles closed 22 July 2025; only in-country switching
-- remains open, to 22 July 2028. This schema's professions.id for those two
-- classifications are care_assistant/senior_carer (see 0001_init's seed
-- data). Enforced here at the DB layer, not left to employer honesty in the
-- app — same standard non-negotiable #2/#3 already hold badges/DBS to.
alter table jobs add constraint jobs_sponsorship_restricted_roles check (
  sponsorship_offered <> 'new_applicant'
  or profession_id not in ('care_assistant', 'senior_carer')
);

create index jobs_employer_id_idx on jobs (employer_id);

alter table jobs enable row level security;

-- Employer-owned, same *_self pattern used throughout (candidates on their
-- own profile, employers on their own verification requests). is_verified_
-- employer() gate matches shortlists' own insert/update policies — an
-- unverified employer can't create jobs any more than they can shortlist.
create policy jobs_employer_self on jobs
  for all using (employer_id = auth.uid() and is_verified_employer())
  with check (employer_id = auth.uid() and is_verified_employer());
