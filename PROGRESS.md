# iCare — Progress Log

This file is the source of truth for "where we left off." Any AI assistant
picking up this project — on any device, any tool — should read this file
first, and update it before ending a session. See `AGENTS.md` / `CLAUDE.md`
for the standing instruction.

## Status: deployed and live, now wired to the real Supabase backend

## Stack / accounts
- **GitHub**: `genesysc/icare`
- **Cloudflare account**: "iCare" (`181e44a6963cb30381a30edbd56a4b46`) — dedicated
  account for this project, separate from other unrelated Cloudflare projects
  on the same login. Account-scoped tools require passing this `account_id`
  explicitly. `workers.dev` subdomain is registered.
- **Database/backend: Supabase project `care-register`**
  (id `blflbiwqflidltqflwew`, org "Genesys Consultancy" /
  `eurukfztpdvalqtjpusu`, region `eu-west-2`). **This is iCare's actual
  backend** — despite the project name, it already has the real data model:
  `accounts`, `candidates`, `employers`, `professions`, `qualifications`,
  `qualification_types`, `registrations`, `dbs_records`, `clinical_skills`,
  `badges`, `employment_history`, `shortlists`, `candidate_references`,
  `cv_imports`, and more — 23 tables total, RLS enabled on all of them.
  URL: `https://blflbiwqflidltqflwew.supabase.co`. Publishable key is in
  `wrangler.jsonc` as a plain var (safe to expose — it's RLS-gated).
  Two other unrelated Supabase projects exist in the same org (`Meridian
  Project`, and `rah-caregiver-portal` which is paused) — don't touch those.
- **D1**: removed. Was a placeholder from initial scaffolding; deleted once
  Supabase was confirmed as the real backend.
- **R2 bucket**: `icare`, bound as `MEDIA` in `wrangler.jsonc` — still used
  for media/file storage, untouched by the Supabase migration.
- **Worker**: `icare` (Hono app in `src/index.ts`), routes: `/health`,
  `/db-check` (queries `professions` via Supabase), `/media-check`.
- **CI**: `.github/workflows/deploy.yml` deploys to Cloudflare Workers on
  push to `main`. Repo secrets `CLOUDFLARE_API_TOKEN` (scoped to the iCare
  account) and `CLOUDFLARE_ACCOUNT_ID` are set. Confirmed working
  end-to-end (run `32843844966`).

## Done
- Connected Cloudflare account "iCare" (separate from other projects).
- Enabled R2 and created bucket `icare`.
- Scaffolded a minimal Workers app (Hono).
- Fixed CI (Wrangler v4 pin, Node 22) and confirmed a real deploy succeeds.
- Registered the account's `workers.dev` subdomain (manual Dashboard step).
- Identified that `care-register` (Supabase) is the real, already-modeled
  iCare backend — not a fresh empty database.
- Replaced D1 with Supabase: `@supabase/supabase-js` added, Worker reads
  `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` from `wrangler.jsonc` vars,
  `/db-check` queries the real `professions` table, old D1 database deleted.

## Not started yet
- The actual app (routes/UI beyond the three check endpoints) — auth,
  candidate/employer flows, feed/social features per the README's "LinkedIn
  for healthcare" framing. The data model already exists in Supabase; no
  app logic has been built against it yet.
- Auth strategy — likely Supabase Auth (`accounts` table FKs to
  `auth.users`), not yet wired into the Worker.
- Custom domain (account currently has none) — still an open choice, not
  blocking anything.
- Confirming the latest deploy (with the Supabase wiring) actually goes
  green in CI — was pushed but not yet verified by a passing run.
