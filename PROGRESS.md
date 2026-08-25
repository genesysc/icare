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
- **Worker**: `icare` (Hono app in `src/index.ts`), routes: `GET /` (landing
  page, see below), `/health`, `/db-check` (queries `professions` via
  Supabase), `/media-check`, and `/auth/*` / `/candidates/*` (see below).
- **Landing page (v2 — waitlist, candidate-primary)**: `src/landing.html`,
  a single self-contained static page (no framework, no build step) served
  via `c.html(landingPage)` at `GET /`. Imported as a raw string via
  wrangler's `rules: [{ type: "Text", globs: ["**/*.html"] }]` config in
  `wrangler.jsonc` (needs `src/html.d.ts` for `tsc` to accept the import).
  **This replaced a first draft** that was built without the real brief and
  got the fundamentals wrong (dual-audience, live account signup) — see
  "Product direction" below for the source documents and what changed.
  Design: serif display type (Fraunces) + monospace labels (IBM Plex Mono)
  + teal/plum palette, matching the provided mockup. No photo assets exist,
  so the hero's "Aoife M." card is CSS-built and captioned "Illustrative
  example profile — not a real person"; its badge labels (verified /
  evidenced / derived / declared) are the real values of `badges.grade` in
  the DB, not invented. Roadmap features (self-expression posts, AI
  discovery, impact stats) are marked "Coming soon" in the UI. Built with
  the `epic-design` skill, restrained for a healthcare/editorial tone; GSAP
  + ScrollTrigger via CDN, full `prefers-reduced-motion` and
  coarse-pointer fallbacks.
- **Waitlist**: `src/waitlist.ts`, mounted at `/waitlist`. Backs the
  landing page's email-capture form (this page's actual primary CTA — not
  full account creation). DB: migration `0007_waitlist` adds a `waitlist`
  table (`email citext unique`, `created_at`) with RLS allowing anyone to
  insert but nobody to read the raw table (emails stay private), plus a
  `SECURITY DEFINER waitlist_count()` RPC so the public count can be shown
  without exposing emails.
  - `POST /waitlist` — `{ email }`. Duplicate email → `{ status: "ok",
    already_joined: true }` (not an error).
  - `GET /waitlist/count` — `{ count }`, currently real and starts at 0.
  **Deliberately not implemented**: the mockup's "53 spots left with
  launch credits" stat — the launch-credit pool size is an explicitly open
  product decision (see below), so no number is shown or guessed.
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
- **Candidate profile API**: `src/candidates.ts`, mounted at `/candidates`,
  all routes behind the shared `requireAuth` middleware (`src/middleware.ts`
  — verifies the bearer token, attaches an RLS-scoped Supabase client as
  `c.get("supabase")` plus `c.get("userId")`/`c.get("user")`; also used by
  `/auth/logout` and `/auth/me` now, replacing duplicated token-parsing
  code). Routes:
  - `GET`/`PATCH /candidates/me` — profile fields. `PATCH` only accepts an
    explicit whitelist (`headline`, `about`, `proud_of`, `postcode_district`,
    `town`, `travel_radius_miles`, `willing_to_relocate`, `right_to_work`,
    `visa_expiry`, `has_driving_licence`, `has_own_vehicle`, `availability`,
    `available_from`, `shift_prefs`, `min_hourly_rate`) — deliberately
    excludes `is_published`/`completeness`/`onboarding_*`, which are owned
    by `publish_my_profile()` and onboarding triggers, not the client.
  - `POST /candidates/me/photo` — raw image body, `Content-Type: image/*`,
    stored in R2 at `candidates/{id}/photo`, updates `photo_path`.
  - `POST /candidates/me/publish` — calls the existing `publish_my_profile()`
    RPC (badge/completeness logic already lives in DB triggers).
  - `GET`/`PUT /candidates/me/professions`, same for `/skills` —
    replace-whole-set semantics against `candidate_professions` /
    `candidate_skills`.
  - `GET`/`POST`/`PATCH`/`DELETE /candidates/me/employment-history/[:id]` —
    full CRUD, each row independently owned.
  - `GET /professions`, `GET /skills` (top-level, no auth) — public
    reference lists to populate pickers.
  **Not yet covered**: qualifications, DBS records, references, badges,
  prompts, CV import.
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

## Product direction (from LANDING_PAGE_COPY.md, uploaded 2026-08-25)

The user uploaded `LANDING_PAGE_COPY.md` and a `landingpage.pdf` mockup,
which is where the v2 landing page above came from. That doc also contains
product-wide decisions that go beyond the landing page — recorded here so
they aren't lost:

- **Candidate self-expression posts (phase 2, not built)**: candidates
  will be able to post freely (not just structured CV fields). Consent is
  **per-post and revocable**: each post is (a) visible to other candidates
  only, (b) included in the employer-facing AI summary/search pool, or
  (c) private. Default must be the most restrictive; inclusion in
  employer-facing AI search is opt-in, never opt-out. Candidates must be
  able to see their current AI summary and retract consent at any time.
- **Employer conversational AI search (phase 2, not built)**: natural-
  language search, not form filters. Two hard constraints from the brief:
  1. **Descriptive, not evaluative** — the AI may say things like
     "frequently posts about dementia care, mentions patience and
     resilience," but must never score, rank, rate, or recommend
     candidates, and must never produce a "fit score." This sharpens (does
     not relax) a stated non-negotiable: no AI scoring/ranking of
     candidates.
  2. **Hard exclusion on protected characteristics** (Equality Act 2010:
     sex, age, race, religion, disability, pregnancy/maternity, sexual
     orientation, gender reassignment, marriage/civil partnership) — the
     search must not filter, rank, or query by these, even if an employer
     phrases a query that way. The brief flags this as needing a real
     validation/guardrail layer on incoming queries (prompt-level
     instructions alone are not sufficient) — **not yet designed or
     built**, and worth getting right before any AI search work starts.
- **Candidate pricing — open legal question, do not ship or advertise
  yet**: the model has shifted from "candidates never pay" to "free to
  join, optional paid boost" (~£30/30 days, not yet built, not advertised
  anywhere including this landing page). The brief itself flags this needs
  legal review: an existing non-negotiable prohibits charging work-seekers
  in connection with finding work (Employment Agencies Act 1973), and a
  paid visibility boost is close enough to that line that it shouldn't be
  assumed compliant. **Do not build or market a boost feature until this
  is confirmed with an employment law specialist.**
- **Referenced but not yet provided: `HANDOVER.md`.** The copy doc treats
  it as the authoritative source for "non-negotiables" (the AI
  scoring/ranking rule above is described as one of them). We don't have
  this file yet — worth asking the user for it, since it likely affects
  more than just the landing page.
- An employer-facing landing page is planned as a separate follow-up
  draft — not yet written, not this page's job (this page keeps employer
  mentions to supporting context only, e.g. "employers are searching iCare
  every day," with no employer signup CTA).

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
- Built the candidate profile API (`src/candidates.ts`) — see Stack section
  for the full route list. Confirmed deployed and green (CI run
  `32848054672`).
- Built the landing page v1, then **rebuilt it as v2** against the real
  brief once it was uploaded — see "Product direction" and Stack section
  above. Includes the new `waitlist` table/RPC and `/waitlist` routes. Not
  yet confirmed deployed/green in CI (just pushed).

## Not started yet
- Employer-side API (profile, verification-request flow, browsing/
  shortlisting published candidates) — deliberately deferred in favor of
  candidate API first.
- Candidate qualifications, DBS records, references, badges, prompts,
  CV import — not covered by the candidate API slice just built.
- Candidate self-expression posts + per-post consent model, employer
  conversational AI search + its protected-characteristics guardrail —
  see "Product direction" above. Explicitly phase 2 in the brief; the
  guardrail design in particular needs care before any of this is built.
- `HANDOVER.md` — referenced by the copy brief as authoritative for
  product non-negotiables, not yet in our hands. Worth asking for.
- Candidate paid "boost" feature — blocked on legal review (Employment
  Agencies Act 1973 question), not just an engineering task.
- Employer-facing landing page — separate piece of work, not started.
- A real signed-in app UI (dashboard, profile editor, etc.) — nothing
  exists yet for a user to land on after authenticating via `/auth/*`.
  The old landing page draft stashed a session in `localStorage` for this;
  the new waitlist-first page doesn't authenticate anyone yet, so that's
  moot until there's a real post-launch flow.
- Employer verification review flow (`employer_verification_requests`,
  `is_verified`) — who reviews these and how is undecided.
- **Custom domain for iCare — now blocking**: needed both for Cloudflare
  (currently on the free `workers.dev` subdomain, fine) and for Sender.net
  (needed to send auth emails from an iCare address). This is the next
  concrete unblock to prioritize.
- Auth-email templates (signup confirmation, password reset, magic link,
  invite) — not designed or written yet, blocked on the domain above.
