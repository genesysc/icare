-- =============================================================================
-- 0004_cv_import.sql
--
-- CV upload, parse, and review-before-apply.
--
-- The rule the whole design turns on: nothing a parser produces reaches the
-- profile without a person confirming it. Years of experience is computed from
-- employment dates, and CV dates are the least reliable thing on the page, so
-- an auto-applied parse quietly poisons the badge that makes the platform
-- worth trusting.
-- =============================================================================

create type cv_parse_status as enum (
  'uploaded',
  'parsing',
  'parsed',
  'review_complete',
  'failed',
  'unreadable'
);

create table cv_imports (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   uuid not null references candidates(id) on delete cascade,

  storage_path   text not null,          -- private bucket 'cvs', key uid/uuid.ext
  original_name  text,
  mime_type      text,
  byte_size      int,

  status         cv_parse_status not null default 'uploaded',
  parsed         jsonb,                  -- proposal only; never the source of truth
  confidence     jsonb,                  -- per-section 0-1
  sensitive_found text[] default '{}',   -- 'date_of_birth','photo','nationality',...
  error_detail   text,

  applied_at     timestamptz,            -- when the candidate accepted the draft
  created_at     timestamptz not null default now(),
  parsed_at      timestamptz
);

create index on cv_imports (candidate_id, created_at desc);
create index on cv_imports (status) where status in ('uploaded', 'parsing');

alter table cv_imports enable row level security;

create policy cv_self on cv_imports
  for all using (candidate_id = auth.uid()) with check (candidate_id = auth.uid());

-- Employers see that a CV exists, and can open it only once shortlisted and
-- consented — the same gate as the intro video and contact details. A PDF with
-- a photo and a nationality on it would otherwise walk straight through the
-- text-only search design.
create policy cv_read_shortlisted on cv_imports
  for select using (
    public.is_verified_employer()
    and exists (
      select 1 from shortlists s
       where s.candidate_id = cv_imports.candidate_id
         and s.employer_id  = auth.uid()
         and s.candidate_consented_at is not null
    )
  );

-- -----------------------------------------------------------------------------
-- Storage
--
-- Run once. Private bucket, 5 MB ceiling, and a fixed MIME allowlist — this is
-- an upload endpoint open to four hundred strangers.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cvs', 'cvs', false, 5242880,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'image/jpeg',
    'image/png',
    'image/heic'
  ]
)
on conflict (id) do nothing;

-- Path convention: {uid}/{uuid}.{ext}. The first path segment must be the
-- caller's own id, so nobody can write into anyone else's folder.
create policy "cv upload own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "cv read own"
  on storage.objects for select to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "cv delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- Retention
--
-- A failed or superseded upload is pure liability — someone's home address and
-- date of birth sitting in a bucket for no reason. Sweep them nightly.
-- -----------------------------------------------------------------------------

create or replace function public.purge_stale_cv_imports()
returns void
language sql
as $$
  delete from cv_imports
   where status in ('failed', 'unreadable')
     and created_at < now() - interval '7 days';

  delete from cv_imports c
   where exists (
     select 1 from cv_imports newer
      where newer.candidate_id = c.candidate_id
        and newer.created_at > c.created_at
        and newer.status = 'review_complete'
   )
   and c.created_at < now() - interval '30 days';
$$;
