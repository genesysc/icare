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
  `/db-check` (queries `professions` via Supabase), `/media-check`,
  and `/auth/*` (see below).
- **Auth**: Supabase Auth, already fully wired at the DB level (migrations
  `0002_auth`, `0005_security_hardening` — not something we need to build,
  only to call correctly). On `auth.users` insert, `handle_new_user()`
  reads `raw_user_meta_data.signup_role` (`candidate`|`employer`,
  clamped — `admin` is unreachable from signup), `full_name`, `org_name`,
  `terms_version`, and creates the matching `accounts` row plus a
  `candidates`+`candidate_contact` row or an `employers`+
  `employer_verification_requests` row. It also mirrors `role` into
  `auth.users.raw_app_meta_data` so it rides in the JWT. `sync_account_email()`
  keeps `accounts.email` in sync with `auth.users.email`. RLS: a user can
  read/update only their own `accounts` row and their own
  `candidates`/`employers` row (`*_self` policies); a verified employer can
  read published candidates (`candidate_read_published` +
  `is_verified_employer()`). Useful RPCs already in the DB:
  `current_role_is(role)`, `is_verified_employer()`, `close_my_account(reason)`,
  `publish_my_profile()`.
  Worker routes in `src/auth.ts`, mounted at `/auth`:
  - `POST /auth/signup` — `{ email, password, role, full_name, org_name?, terms_version? }`
  - `POST /auth/login` — `{ email, password }`
  - `POST /auth/logout` — needs `Authorization: Bearer <access_token>`
  - `GET /auth/me` — needs `Authorization: Bearer <access_token>`, returns
    `{ user, account }`
  All four use the anon/publishable key with the caller's own bearer token
  forwarded — no service_role key anywhere in the Worker, RLS applies
  normally.
- **CI**: `.github/workflows/deploy.yml` deploys to Cloudflare Workers on
  push to `main`. Repo secrets `CLOUDFLARE_API_TOKEN` (scoped to the iCare
  account) and `CLOUDFLARE_ACCOUNT_ID` are set. Confirmed working
  end-to-end multiple times, most recently with the auth routes (run
  `32846907150`).
- **Transactional email (auth emails): decided, not yet built.** Will use
  Sender.net as the SMTP relay behind Supabase Auth's custom SMTP setting
  (Supabase Dashboard → Authentication → Emails → SMTP Settings) — Supabase
  keeps generating/verifying the secure confirmation/reset links, Sender.net
  just delivers them, and email HTML is fully custom via Supabase's
  Authentication → Emails → Templates editor (`{{ .ConfirmationURL }}` etc.).
  Rejected: a fully custom Worker→Sender.net flow using the `service_role`
  key — more to build, duplicates security logic Supabase already handles,
  no benefit over the SMTP-relay approach since template customization is
  available either way.
  **Blocked on**: a dedicated `icare` domain — user wants auth emails to
  come from an iCare address, not the existing verified
  `genesysconsultancy.co.uk` domain in Sender.net (account "Genesys
  Consultancy Ltd", id `egLgor`, free plan). Once a domain exists: verify
  it in Sender.net (Domains → Add Domain → add the SPF/DKIM/DMARC records
  it gives you), grab SMTP relay credentials from Sender.net (Settings →
  SMTP/API — no MCP tool exposes these, manual dashboard step), then add
  them under Supabase's custom SMTP settings (also a manual dashboard step,
  no MCP/API tool covers Supabase Auth config).

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
- Built `/auth/signup`, `/auth/login`, `/auth/logout`, `/auth/me` in
  `src/auth.ts`, matching the DB's existing `handle_new_user()` trigger
  contract exactly (see Stack section above for the field names it expects).
  Confirmed deployed and working (CI run `32846907150`).
- Decided the auth-email approach (Sender.net as SMTP relay behind Supabase
  Auth) — see Stack section. Not yet built, waiting on an iCare domain.

## Not started yet
- Everything past auth: candidate/employer profile flows (onboarding wizard,
  publishing, CV import), feed/social features per the README's "LinkedIn
  for healthcare" framing. The data model and its triggers/RPCs already
  exist in Supabase; almost no app logic has been built against it yet
  beyond signup/login.
- No frontend/UI of any kind exists — the Worker is a JSON API only so far.
- Employer verification review flow (`employer_verification_requests`,
  `is_verified`) — who reviews these and how is undecided.
- **Custom domain for iCare — now blocking**: needed both for Cloudflare
  (currently on the free `workers.dev` subdomain, fine) and for Sender.net
  (needed to send auth emails from an iCare address). This is the next
  concrete unblock to prioritize.
- Auth-email templates (signup confirmation, password reset, magic link,
  invite) — not designed or written yet, blocked on the domain above.
