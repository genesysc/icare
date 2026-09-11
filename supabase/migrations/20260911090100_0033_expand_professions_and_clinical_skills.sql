-- Founder feedback from live onboarding testing (2026-09-11): the
-- professions and clinical_skills catalogues are too thin.
--
-- professions had zero Medicine entries at all — no doctors of any grade —
-- despite `regulator` (the enum) already having a `gmc` value sitting
-- unused since 0001_init, and zero Optometry entries despite `goc` also
-- sitting unused. Both regulators were clearly anticipated but never
-- populated. Added the standard UK medical career grades (GMC-regulated)
-- and the two GOC-regulated optical professions.
--
-- clinical_skills had 14 entries across 3 families, all social-care/
-- nursing-flavoured — nothing for the allied health professions the app
-- already lists (physiotherapist, OT, SLT, dietitian, radiographer,
-- podiatrist all shared the exact same generic list), and no medication-
-- specific skills beyond two named drugs. Expanded within the existing
-- family shapes and added two new families (Medication, Allied health)
-- rather than overloading "Clinical" with everything.
--
-- Deliberately kept at the same granularity the existing catalogue already
-- uses (broad roles/skills, e.g. "Physiotherapist" not narrowed further by
-- sub-specialty) rather than exploding into an exhaustive list — matches
-- how UK healthcare staffing platforms categorise these in practice.

insert into professions (id, name, family, regulator, sort_order) values
  ('foundation_doctor', 'Foundation Doctor (FY1/FY2)', 'Medicine', 'gmc', 1),
  ('core_trainee',       'Core Trainee / SHO',          'Medicine', 'gmc', 2),
  ('specialty_registrar','Specialty Registrar (StR)',   'Medicine', 'gmc', 3),
  ('sas_doctor',         'Specialty Doctor / SAS Doctor','Medicine', 'gmc', 4),
  ('gp',                 'GP (General Practitioner)',   'Medicine', 'gmc', 5),
  ('gp_registrar',       'GP Registrar (GPStR)',        'Medicine', 'gmc', 6),
  ('consultant',         'Consultant',                  'Medicine', 'gmc', 7),
  ('locum_doctor',       'Locum Doctor',                'Medicine', 'gmc', 8),
  ('clinical_fellow',    'Clinical Fellow',              'Medicine', 'gmc', 9),
  ('optometrist',        'Optometrist',                  'Optometry','goc', 45),
  ('dispensing_optician','Dispensing Optician',          'Optometry','goc', 46);

insert into clinical_skills (id, label, family) values
  -- Clinical (expanded — was hand-picked around meds/feeding/airway only)
  ('wound_care',     'Wound care / dressing',            'Clinical'),
  ('venepuncture',   'Venepuncture (blood taking)',      'Clinical'),
  ('cannulation',    'Cannulation',                       'Clinical'),
  ('ng_feeding',     'NG tube feeding',                   'Clinical'),
  ('oxygen_therapy', 'Oxygen therapy',                    'Clinical'),
  ('nebuliser',      'Nebuliser administration',          'Clinical'),
  ('suctioning',     'Airway suctioning',                 'Clinical'),
  ('bladder_scan',   'Bladder scanning',                  'Clinical'),
  ('vital_signs',    'Vital signs monitoring (NEWS2)',    'Clinical'),
  ('ecg',            'ECG recording',                     'Clinical'),
  ('continence_care','Continence care',                   'Clinical'),
  -- Medication (new — was previously two named drugs buried in Clinical)
  ('med_admin_oral', 'Medication administration (oral)',  'Medication'),
  ('controlled_drugs','Controlled drugs administration',  'Medication'),
  ('mar_charts',     'MAR chart management',              'Medication'),
  -- Manual handling (expanded)
  ('bariatric_handling','Bariatric moving and handling',  'Manual handling'),
  ('falls_response', 'Falls management and response',     'Manual handling'),
  -- Specialist (expanded — was 6 conditions, missing common ones)
  ('learning_disabilities','Learning disabilities support','Specialist'),
  ('mental_health',  'Mental health support',              'Specialist'),
  ('substance_misuse','Substance misuse support',          'Specialist'),
  ('brain_injury',   'Brain injury / neuro rehabilitation','Specialist'),
  ('diabetes_care',  'Diabetes management',                'Specialist'),
  ('respiratory_copd','Respiratory conditions (COPD)',     'Specialist'),
  ('oncology_care',  'Cancer / oncology care',             'Specialist'),
  ('paediatric_care','Paediatric care',                    'Specialist'),
  -- Allied health (new — physio/OT/SLT/dietetics/radiography had nothing
  -- of their own before this)
  ('manual_therapy', 'Manual therapy',                     'Allied health'),
  ('exercise_prescription','Exercise prescription',        'Allied health'),
  ('splinting',      'Splinting and casting',               'Allied health'),
  ('dysphagia',      'Swallowing assessment (dysphagia)',   'Allied health'),
  ('home_assessment','Home / environment assessment',       'Allied health');
