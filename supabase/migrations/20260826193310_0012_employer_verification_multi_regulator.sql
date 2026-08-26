-- =============================================================================
-- Generalise employer verification beyond CQC.
--
-- Founder decision, 2026-08-26: not every UK care employer is CQC-registered —
-- Scotland's Care Inspectorate and Northern Ireland's RQIA cover the same
-- ground in their nations, and Wales has CIW. The founder also explicitly
-- deprioritised region-specific agency-licensing checks: the real minimum bar
-- for "verified employer" is being a genuine UK-registered company (Companies
-- House number), with a care-regulator registration collected as
-- supplementary evidence only where the employer actually has one.
--
-- cqc_provider_id -> regulator_reg_number (generalised, same column, just
-- correctly named) on both employers and employer_verification_requests,
-- plus a new `regulator` enum on each to say which regulator that number is
-- registered with. employers also gains companies_house_no directly (it
-- already existed on employer_verification_requests as the audit trail;
-- this mirrors the same "current claimed value on employers, audit trail on
-- requests" pattern cqc_provider_id already used).
-- =============================================================================

create type care_regulator as enum (
  'cqc',                        -- Care Quality Commission (England)
  'care_inspectorate_scotland', -- Care Inspectorate (Scotland)
  'rqia',                       -- Regulation and Quality Improvement Authority (Northern Ireland)
  'ciw'                         -- Care Inspectorate Wales
);

alter table employers
  rename column cqc_provider_id to regulator_reg_number;
alter table employers
  add column regulator care_regulator,
  add column companies_house_no text;

alter table employer_verification_requests
  rename column cqc_provider_id to regulator_reg_number;
alter table employer_verification_requests
  add column regulator care_regulator;
