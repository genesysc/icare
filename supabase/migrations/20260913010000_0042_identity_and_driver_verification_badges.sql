-- Two new badge catalog entries for manually-confirmed verification tiers
-- the founder described (icon+colour near the name, not a text chip, for
-- the identity ones — see dashboard.html). id_verified already existed in
-- the catalog (added early in the build) but nothing ever awarded it.
--
-- These stay manual-only, same as every other review step in this app
-- (qualifications, employer verification, the DBS reviewed_at field added
-- in 0041) — no admin UI exists anywhere, staff awards a badge row via a
-- direct Supabase-dashboard insert into candidate_badges once they've
-- actually checked the physical/scanned document:
--   id_verified               -- already existed: government photo ID/passport checked
--   dbs_certificate_verified  -- NEW: DBS certificate number (checked against
--                                 secure.crbonline.gov.uk) AND the certificate
--                                 copy ("green slip") both checked
--   driving_licence_verified  -- NEW: a valid driving licence has actually
--                                 been shown, distinct from the existing
--                                 self-declared `driver` badge (has_driving_licence
--                                 + has_own_vehicle, auto-awarded at publish,
--                                 grade 'declared' — left untouched)
insert into badges (code, label, grade, family, description) values
  ('dbs_certificate_verified', 'DBS Certificate Verified', 'verified', 'Safeguarding',
   'DBS certificate number checked against the government DBS checker and the certificate copy reviewed by iCare staff.'),
  ('driving_licence_verified', 'Verified Driver', 'verified', 'Practical',
   'Valid driving licence checked by iCare staff — distinct from the self-declared "hold a licence" badge.')
on conflict (code) do nothing;
