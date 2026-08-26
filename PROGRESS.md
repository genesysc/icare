# iCare — Progress Log

**Read `HANDOVER.md` first** — it's the curated entry point (non-negotiables,
stack, file map, what's built/not, gotchas, open questions). This file is
the detailed chronological session log: consult it for history or specifics
`HANDOVER.md` doesn't cover. Any AI assistant picking up this project — on
any device, any tool — should read both before doing anything, and update
this file before ending a session (update `HANDOVER.md` too if something
changes that a fresh agent needs up front). See `AGENTS.md` / `CLAUDE.md`
for the standing instruction.

## Status: SPRINTS.md's employer track revised, ready to start building

PR #9, #10, and #11 all merged and deployed (waitlist landing pages,
candidate + employer). `main` is deployed and live, wired to the real
Supabase backend. Branch restarted from `main` after each merge per this
repo's convention (see "Conventions" — HANDOVER.md §10). Employer landing
page v2 (see "Done" below) is pushed to the branch, not yet merged.

User asked to move past the waitlist and start building the actual
platform, candidate journey first then employer, and asked for sprints
to tackle the scope one by one — `SPRINTS.md` was written for that. The
employer landing page v2 brief then revealed a materially bigger employer
product than the original employer track assumed (chat-first AI search,
a built-in ATS, an "iCompliance" module, AI candidate summaries, AI-parsed
video interviews) — flagged, then talked through with the user before
writing any employer code.

**Scope conversation outcome** (see "Done" below for the full breakdown):
chat is the primary employer interface from day one, not a fast-follow
layer; pipeline stages are fixed (Shortlisted/Interview/Offer/Hired) for
now; AI-parsed video interviews are a separate, later initiative, not in
this track; iCompliance is real and scoped (an employer's own compliance
checklist/workflow per hire) but explicitly not urgent — captured as an
unscheduled Sprint 12. `SPRINTS.md`'s employer track (Sprints 6–11) is
now revised and current. Also caught and documented: the brief's mockups
show partial candidate names pre-shortlist, which violates non-negotiable
#4 — the real search/chat product must stay fully anonymous pre-
shortlist regardless of what the marketing mockup shows.

Nothing built yet from either track — `SPRINTS.md` is ready, next step is
picking a sprint to start (candidate Sprint 0, or the employer landing
page PR first).

Custom-domain/Sender.net work remains explicitly parked per the user's
earlier request ("will buy the domain in a few days time") — don't
restart it unless the user brings it back up. One exception carved out
in `SPRINTS.md` Sprint 0: the Supabase Magic Link email template fix
doesn't need the domain and is worth doing regardless.

## ⚠️ Non-negotiables (from HANDOVER.md, "care·register" — uploaded 2026-08-25)

The product's actual name/internal codename is **care·register** (same
Supabase project we've been calling `care-register`). This doc is the real
engineering source of truth referenced earlier as "HANDOVER.md" — the user
found it via a shared Claude conversation link I couldn't fetch, then
uploaded it directly along with several Next.js reference files. **Read
this section before touching auth, badges, DBS, search, or pricing.**
These are compliance-driven, not ordinary product preferences — treat them
like `AGENTS.md`-level instructions, not suggestions:

1. **Candidates are never charged, for anything.** Employment Agencies Act
   1973 s6(1) (no fee for finding work, directly or indirectly) + 2003
   Conduct Regulations reg. 5 (can't condition work-finding on buying other
   services) + DHSC Code of Practice (stricter still for international
   health/social care recruitment). No premium profile, no featured
   listing, **no profile boost**, no paid CV review. This **settles** the
   "optional boost, pending legal review" note from `LANDING_PAGE_COPY.md`
   — it's not pending, it's prohibited. Already fixed: removed "optional
   boosts available" copy from the landing page.
2. **Badge grades are earned, never bought, never mis-graded.** Four fixed
   grades on `badges.grade` (confirmed matches the real enum): `verified`
   (checked against a public register/identity provider, awarded by
   system), `evidenced` (document uploaded, human-reviewed), `derived`
   (computed from platform data), `declared` (candidate said so,
   unchecked). UI must keep these visually distinct — a declared badge must
   never look like a verified one. No client write path to
   `candidate_badges` should ever exist (RLS: read-only to clients; awards
   via service role or `SECURITY DEFINER` functions only).
3. **Never claim a DBS is "verified."** We cannot verify a DBS certificate
   — only the employer can, via the DBS Update Service. Correct wording:
   *"Enhanced DBS · on Update Service."* Forbidden: "DBS Certified/Verified/
   Checked" or anything implying we validated it. The certificate number
   is stored (`dbs_records`) but never shown on the open profile — only
   released after shortlist + candidate consent.
4. **Written shortlisting before anything visual.** Equality Act 2010
   exposure. Any future employer-facing search view must exclude photo,
   name, video, and CV file — those unlock only after shortlist + consent.
   Not yet built on our side (no employer search exists), but binding on
   whatever we build.
5. **AI never scores, ranks, or filters a candidate.** Matches (sharpens)
   what `LANDING_PAGE_COPY.md` already said. AI may summarise/extract/
   transcribe/draft; a human decides. A CV parser (not yet built here)
   must propose a draft that the candidate confirms — never auto-apply a
   parse.
6. **Data minimisation on anything ingested.** A CV parser must not
   extract DOB, nationality, immigration detail, marital status, gender,
   religion, ethnicity, health info, NI numbers, or photos — flag them in
   `sensitive_found` instead (matches the real `cv_imports.sensitive_found`
   column already in the schema) so the candidate can be told to remove
   them. Postcodes on profile are outward-district only (`EN1`) — full
   postcode lives in `candidate_contact`, gated behind shortlist +
   consent. (Our `PATCH /candidates/me` whitelist already only exposes
   `postcode_district`, not a full postcode — already compliant here.)
7. **Regulation 22 (vulnerable persons)**: before a placement, confirm
   identity, qualifications, and **two references**, and give the hirer
   copies. `registrations`, `qualifications`, `candidate_references`,
   `shortlists` are the audit trail. No placement feature exists yet on
   either build — flagging so it isn't skipped when one is built.
8. **Immigration facts constraining copy/filters**: overseas recruitment
   for *care worker* and *senior care worker* roles closed 22 July 2025;
   in-country switching runs to 22 July 2028. Don't build copy/filters
   implying overseas sponsorship for those two specific roles. Other
   healthcare roles are unaffected.

**Auth method mismatch — flagging, not yet changed.** HANDOVER.md specifies
**email OTP (6-digit code), no passwords at all** — magic links were
explicitly rejected (opening one in a mobile mail app loses the session in
a different browser); reasoning given is that this audience returns every
few months and a forgotten password is a lost candidate. What we've built
in `src/auth.ts` is **password-based** (`signUp`/`signInWithPassword`).
Low risk to change right now — nothing currently deployed calls
`/auth/signup` or `/auth/login` (the live landing page only calls
`/waitlist`) — but it's a real rework of those two routes, so flagging for
a decision rather than silently redoing it. See chat for the question.

**Architecture note — a separate Next.js reference app exists.** The
uploaded files (`onboarding-page.tsx`, `candidate-home-page.tsx`,
`cv-review-page.tsx`, `cv-gate.tsx`, `cv-status-route.ts`, `onboarding.css`,
plus HANDOVER's own file map) are from a **Next.js App Router** build
against the *same* Supabase project — cookie-based `@supabase/ssr` auth,
server actions for mutations, middleware for route-gating (not the
security boundary — RLS is), a Deno Edge Function (`parse-cv`) calling
Claude for CV parsing. This is a materially different, more complete
system than what exists in this Cloudflare Workers repo (it already has a
3-step onboarding wizard, CV upload/parse/review, and a candidate home
page — none of which exist here yet).
**Decision (2026-08-25): Cloudflare Workers is the build going forward.**
The Next.js files are a spec for what each screen needs to do — port the
*logic and business rules*, not the code verbatim (different framework:
no server components, no server actions, no Next.js middleware here).
Concretely still to build, using the Next.js files as reference:
  - Onboarding wizard (3 steps: role/registration → location/availability
    → employment history), with resume-where-left-off via
    `candidates.onboarding_step`.
  - CV upload → parse → review → apply flow. The real version calls Claude
    from a server-side function to parse the CV into a draft, which the
    candidate must confirm before it's written (non-negotiable #5) — ours
    would need an equivalent Worker-side call to the Claude API, not yet
    built. Data-minimisation rules (non-negotiable #6) apply directly.
  - A candidate home page (completeness %, published status, badges list,
    "badges are earned, never bought" messaging per non-negotiable #2).
  - `/privacy` and `/terms` pages — referenced by the real join form,
    must exist before a real signup flow ships.

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
  landing page's signup form (this page's actual primary CTA — not full
  account creation; captures name/email/phone, not credentials). DB:
  migration `0007_waitlist` creates the table (`email citext unique`,
  `created_at`), `0008_waitlist_details` adds `full_name` (required),
  `phone` (optional). RLS: anyone can insert, nobody can read the raw
  table (emails/names/phones stay private), plus a
  `SECURITY DEFINER waitlist_count()` RPC so a public count can be shown
  without exposing anyone's data.
  - `POST /waitlist` — `{ email, full_name, phone? }`. Duplicate email →
    `{ status: "ok", already_joined: true }` (not an error). On success:
    `{ status: "ok", position, is_early_supporter }` — `position` is a
    real count-based rank (not exact under concurrency, fine for this),
    `is_early_supporter` is true when `position <= 100`
    (`EARLY_SUPPORTER_THRESHOLD` in `src/emails/waitlist-welcome.ts`).
    Also fires (currently no-op, see below) a welcome email.
  - `GET /waitlist/count` — `{ count }`, real, starts at 0.
  **Early-signup incentive is recognition only, never a credit**: the
  landing page and welcome email tell someone in the first 100 they'll be
  "near the front of the queue," full stop — no bonus credit, no paid
  feature unlock. `LANDING_PAGE_COPY.md`'s "50 bonus credit... paid
  features" idea was rejected outright: it's exactly what HANDOVER.md's
  non-negotiable #1 prohibits (a candidate payment/fee in disguise). This
  was an explicit user decision, not an inferred one.
  **Deliberately not implemented**: the mockup's "53 spots left" stat —
  the launch-credit pool size (if any non-monetary version of it is ever
  decided) is still an open product decision, so no number is shown.
- **Welcome email — built, not sending yet.**
  `src/emails/waitlist-welcome.ts` has the real subject/HTML (personalised
  greeting, early-supporter messaging when true, social share links for
  X/LinkedIn/Facebook/WhatsApp built from the recipient's own referral
  intent). `src/email.ts` (`sendTransactionalEmail`) is a **deliberate
  no-op** right now — logs what it would send instead of sending —
  because actually sending needs a verified `icare` domain in Sender.net,
  and the user chose to wait for that rather than send from the existing
  `genesysconsultancy.co.uk` address. To activate later: verify the
  domain in Sender.net, `wrangler secret put SENDER_API_KEY` (a real
  secret — never a plain `wrangler.jsonc` var), add `SENDER_FROM_EMAIL` to
  `wrangler.jsonc` vars, then fill in the actual Sender.net API call in
  `sendTransactionalEmail` (not yet looked up which endpoint/payload
  shape — check current Sender.net docs when this is picked up).
- **Social sharing**: on-page (a share panel with the same four platforms
  appears after a successful waitlist signup, replacing the form) and in
  the welcome email template — both use plain share-intent URLs
  (twitter.com/intent, LinkedIn sharing, Facebook sharer, wa.me), no
  external library, no API keys needed.
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
  **Auth method: email OTP, no passwords** (per HANDOVER.md — this
  audience returns every few months, a forgotten password is a lost
  candidate; magic links were explicitly rejected — opening one in a
  mobile mail app opens a different browser and loses the session).
  Worker routes in `src/auth.ts`, mounted at `/auth`:
  - `POST /auth/request-code` — `{ email, create?, role?, full_name?, org_name?, terms_version? }`.
    One entry point for both sign-up and sign-in; `create` (default true,
    maps to Supabase's `shouldCreateUser`) is the only difference — pass
    `create: false` on a sign-in screen so an unrecognised email doesn't
    silently create an account. `role` is required when `create` is true.
  - `POST /auth/verify-code` — `{ email, token }` (the 6-digit code) →
    `{ user, session }`.
  - `POST /auth/logout` — needs `Authorization: Bearer <access_token>`
  - `GET /auth/me` — needs `Authorization: Bearer <access_token>`, returns
    `{ user, account }`
  All use the anon/publishable key with the caller's own bearer token
  forwarded — no service_role key anywhere in the Worker, RLS applies
  normally.
  **⚠️ Manual Supabase Dashboard step still needed, not yet done**:
  HANDOVER.md flags that the default "Magic Link" email template must be
  changed to reference `{{ .Token }}` (Authentication → Emails →
  Templates), or `verifyOtp` rejects every valid code — described there as
  "the first thing that breaks." No API/MCP tool covers Supabase Auth
  email template config; this needs a human in the dashboard, same
  category of blocker as the `workers.dev` subdomain and SMTP settings
  were.
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
- **Candidate pricing — RESOLVED, not open.** `LANDING_PAGE_COPY.md`
  described this as pending legal review; `HANDOVER.md` (the real
  engineering source of truth) settles it: candidates are never charged,
  full stop, no boost feature, ever. See the Non-negotiables section
  above. Landing page copy already fixed.
- **`HANDOVER.md` — now provided** (see Non-negotiables section above).
  The user found it via a shared Claude conversation link this session
  couldn't fetch (sandboxed network policy blocks `claude.ai/share/*`,
  confirmed via both the standard fetch tool and a headless-browser
  fallback through the configured proxy), so they uploaded it directly.
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
  above. Includes the new `waitlist` table/RPC and `/waitlist` routes.
- Received `HANDOVER.md` + Next.js reference files; removed the
  candidate-boost pricing language it invalidated (compliance fix, already
  pushed); recorded all non-negotiables above so they can't be lost again.
- Switched `/auth` to email OTP (`request-code`/`verify-code`), matching
  HANDOVER.md — see Stack section.
- Expanded waitlist to capture name + phone, added on-page + email social
  sharing, built (not yet sending) a real welcome email — see Stack
  section. Early-signup incentive is recognition-only per an explicit user
  decision, not a paid-feature credit.
- PR #9 merged and deployed to `main` (CI run `32860791093`) — auth,
  candidate API, landing page, waitlist, and `HANDOVER.md` all live.
- **Landing page responsive cleanup**, actually tested (not just read) at
  6 real viewport sizes via headless Chromium:
  - Rebuilt the hero visual: was 3 separately absolutely-positioned
    floating elements (an empty decorative box + a stat pill + a profile
    card) needing per-breakpoint repositioning, worst on mobile where the
    empty box alone ate most of the first screen. Now one naturally-
    flowing profile card (name/role/badges/stats combined) with a soft
    glow behind it — no absolute positioning, no per-breakpoint
    overrides, shrinks cleanly on its own.
  - `.wrap` container widened 760px → 880px; `.feature-list` switched
    from a hardcoded single column to `repeat(auto-fit, minmax(240px,
    1fr))` so it flows to 2-3 columns on wider screens instead of always
    stacking vertically.
  - Removed one dead CSS rule (`.section-tight`) found via a full pass
    checking every class in the stylesheet against actual markup usage.
  - Confirmed: zero horizontal overflow at any tested size, before or
    after the fix (the underlying breakpoints were already sound — the
    problems were composition/space-usage, not overflow bugs).
  - Opened as PR #10 (https://github.com/genesysc/icare/pull/10),
    squash-merged to `main` after the photo change below was added to it.
    Deploy run #11 succeeded.
- **Real photo for the hero card's illustrative profile.** User uploaded a
  photo (woman in blue scrubs, ID badge "Emily R." / "Healthcare
  Assistant"). Cropped to a centered 240x240 square (`Pillow`, biased
  toward the face), re-encoded as JPEG (~10KB), embedded as a base64 data
  URI in a new `.profile-avatar` (52px circle) inside `.profile-card`,
  next to the name/role — keeps `landing.html` a single self-contained
  file, no R2/asset route needed. Updated the card text from "Aoife M." /
  "Senior Care Assistant · Belfast" to "Emily R." / "Healthcare Assistant ·
  Belfast" to match the badge in the photo (kept Belfast — not visible in
  the photo, no reason to change it). Kept the existing "Illustrative
  example profile — not a real person" caption unchanged. Verified: `tsc
  --noEmit` clean, `wrangler deploy --dry-run` succeeds (839 KiB / 179 KiB
  gzip, up ~14 KiB from the avatar), re-ran the 6-viewport headless-Chromium
  audit — zero horizontal overflow, avatar renders cleanly on mobile and
  desktop. Pushed as a second commit on PR #10, which is now merged and
  deployed (see Status above).
- **Employer-facing landing page** (`src/employers.html`, `GET /employers`).
  Same design tokens/fonts/motion as the candidate page, reused directly
  rather than re-derived — kept the same profile-card hero visual (with
  the real photo) since "this is what you'll see when you search" reads
  naturally from an employer's perspective too, just with a different
  caption. Copy is grounded in what's actually built: no employer
  search/shortlisting/verification exists yet (HANDOVER.md §8 item 4), so
  every specific feature card (verified badges, written shortlisting,
  DBS handling, natural-language search) is tagged "Coming soon" — only
  the waitlist mechanism and the "real, growing candidate pool" claim are
  live today. No pricing is stated anywhere — employer pricing hasn't
  been decided, and non-negotiable #1 (candidates never pay) doesn't
  apply to employers, but nothing here commits to a number either.
  - **Backend**: migration `0009_waitlist_employer_role` adds `role`
    (`text`, default `'candidate'`, checked against `('candidate',
    'employer')`) and `org_name` (`text`, nullable) to `waitlist`, plus a
    check constraint requiring `org_name` when `role = 'employer'`.
    `waitlist_count()` now takes an optional `p_role` param (default
    `'candidate'`) — the old zero-arg overload was dropped (`create or
    replace` with a new signature adds an overload rather than replacing;
    caught this via a direct SQL query erroring "not unique" and fixed
    with an explicit `drop function`). `POST /waitlist` and
    `GET /waitlist/count` both accept `role`, defaulting to `'candidate'`
    so the existing candidate page's calls are untouched.
  - New `src/emails/employer-waitlist.ts` — same structure/compliance
    conventions as the candidate welcome email, employer-specific copy,
    no pricing language. Still routed through the same
    `sendTransactionalEmail()` no-op stub (domain blocker, see above).
  - Both pages cross-link: a short nav item ("For employers" /
    "For candidates" — a first attempt at longer sentence-style links
    wrapped onto two lines on a 390px-wide phone, caught by the
    responsive audit and fixed by shortening) plus a footer link.
  - Verified: `tsc --noEmit` clean, `wrangler deploy --dry-run` bundles
    cleanly (885 KiB / 199 KiB gzip), 6-viewport headless-Chromium audit
    on both pages — zero horizontal overflow. Local `wrangler dev`
    couldn't reach Supabase directly (this sandbox's network egress
    allowlist doesn't include `*.supabase.co` — a sandbox limitation, not
    a code issue), so the insert path and the `org_name` check constraint
    were verified directly against the real Supabase schema instead: a
    test employer row inserted successfully, an employer row without
    `org_name` correctly rejected by the constraint, then the test row
    deleted and both waitlist counts confirmed back at 0.
  - Opened as PR #11 (https://github.com/genesysc/icare/pull/11),
    squash-merged to `main`. Deploy run #12 succeeded.
- **`SPRINTS.md` written.** User wants to move past the waitlist and
  build the real platform: candidate onboarding journey first, then
  employer. Queried the full real Supabase schema (`list_tables`,
  verbose) rather than guessing at column names, and found
  `candidates.onboarding_step`/`onboarding_done` plus an
  `onboarding_events` table already exist — confirms a stepped wizard
  was the original design intent, not new scope being invented. Plan:
  Sprint 0 (privacy/terms pages, the Magic Link template fix, an explicit
  UI-approach default of continuing server-rendered HTML + vanilla JS
  with no new framework, a shared client-side auth-token helper), then
  5 candidate sprints (auth UI → onboarding wizard shell + basics/skills/
  availability → employment history/qualifications/registrations → DBS
  consent/references/prompts → photo/review/publish/candidate home), then
  5 employer sprints (auth UI → verification flow → compliant written-
  first search per non-negotiable #4 → shortlisting + consent unlock →
  employer dashboard). Each sprint lists which routes already exist vs.
  need building, so nothing gets rebuilt by accident. Explicitly flagged
  as deferred, not forgotten: admin review tooling for
  qualifications/registrations/employer-verification (manual Supabase
  review for now), self-expression posts + employer AI search (§9,
  phase 2), anything needing real outbound email (still blocked on the
  parked domain), employer 2FA. Not started — no code written yet.
- **Employer landing page v2** (`src/employers.html`), rebuilt against
  the user's actual uploaded design draft + copy brief
  (`employerlandingpage.html` + `EMPLOYER_LANDING_PAGE_COPY.md`) —
  same relationship as the candidate page's v1→v2 rebuild earlier: v1 was
  our own reasonable guess, v2 is the real brief, so v2 wins outright
  rather than being merged/reconciled with v1. New sections: sticky nav,
  hero with a "search → pipeline" mockup panel, "What is iCare", a
  dedicated AI-callout section with a chat-interface mockup, a 5-step
  "How it works", a 5-card feature grid, a trust/compliance strip, and
  the waitlist CTA. New palette/type system (purple/lavender/teal/gold,
  Fraunces + Public Sans + IBM Plex Mono) kept as designed — deliberately
  not forced to match the candidate page's plum/teal/amber system, since
  this is the user's own considered design pass, not something to
  override for consistency's sake.
  - **Backend**: migration `0011_waitlist_hiring_for` adds a nullable
    `hiring_for` column (`temp`/`permanent`/`both`, check-constrained) to
    `waitlist` — the copy brief calls for capturing it, the form only
    had email before. `POST /waitlist` accepts it now (employer-only,
    silently ignored for candidate submissions).
  - **Fixes made against the uploaded draft** (all grounded in
    conventions already established this session, not new opinions):
    - The draft's waitlist counter showed hardcoded fake numbers ("62
      employers on the waitlist / 18 regions represented so far") —
      directly against this project's rule since the very first waitlist
      build, restated explicitly in the candidate v2 rebuild: real
      counts only, starting at 0, no fabricated social proof. Wired to
      the real `GET /waitlist/count?role=employer`; dropped "regions
      represented" entirely since nothing tracks that.
    - The draft's form only collected email + a "hiring for" select —
      insufficient for the backend (`full_name` required always,
      `org_name` required for employer role). Added "Organisation name"
      and "Your name" fields.
    - The AI chat mock had the assistant offer to "shortlist the top
      matches" — the copy brief's OWN compliance note two paragraphs
      above explicitly forbids exactly this ("avoid words like...
      'top candidates'" — evaluative language against non-negotiable
      #5). Reworded to "shortlist all of them, or show the full list
      first" — descriptive, not evaluative. Worth flagging to the user:
      this slipped past their own stated rule in the source material.
    - Nav's "How it works" link pointed at `#features` (the features
      grid) instead of the how-it-works section, which had no `id` at
      all — real bug in the draft, fixed.
    - Added an "Illustrative — not real candidates or data" caption on
      the hero mockup panel, matching the candidate page's convention
      for its illustrative profile card — the mockup shows named,
      specific-looking pipeline data ("Grace T., hired") that could
      otherwise read as real.
    - Dropped the draft's hotlinked Unsplash hero photo (an external
      CDN image URL of an identifiable person). Same category of
      concern the candidate page's real photo replaced a placeholder
      for — unconfirmed licensing, fragile external dependency, breaks
      the self-contained-file convention this project uses throughout.
      Can add a real, cleared photo the same way (crop + embed as base64)
      if the user supplies one, same as before.
    - Reconciled the features grid to the `.md`'s 5 cards (Trust,
      Pipeline, Character, Flexible, Visibility) rather than the HTML
      draft's differing 4 (draft was missing Pipeline/Character, had an
      extra Interviews card not in the brief) — the `.md` is the more
      recent, more complete source and says so explicitly.
    - Added the same GSAP+ScrollTrigger motion (word-by-word headline,
      section reveals, reduced-motion/no-js fallbacks) and a post-submit
      share panel (X/LinkedIn/Facebook/WhatsApp/copy-link) as the other
      two pages — the draft had neither, for visual/UX parity.
    - Kept the "For candidates" nav/footer cross-link (draft didn't have
      one — it's a static mockup unaware of the other live page).
  - **Bug found and fixed during responsive audit**: at 360px width, the
    nav's "for employers" tag pill + waitlist button didn't fit
    alongside the logo — added a `max-width: 400px` breakpoint shrinking
    nav padding/font sizes. Confirmed zero horizontal overflow at all 6
    tested viewport sizes after the fix.
  - Verified: `tsc --noEmit` clean, `wrangler deploy --dry-run` bundles
    cleanly (884 KiB / 190 KiB gzip), the new `hiring_for` column and its
    check constraint verified directly against the real Supabase schema
    (valid value inserted successfully, invalid value correctly
    rejected, test row deleted, counts confirmed back at 0).
  - **Flagged, not yet acted on**: the copy brief describes chat-first AI
    search + a full ATS + an "iCompliance" module + AI interview parsing
    as the real employer product — none of this is in `SPRINTS.md`'s
    employer track (Sprints 6–10), which assumed simple structured-field
    search. The brief's own text acknowledges this ("a new major
    workstream... not yet reflected in HANDOVER.md's technical scope...
    needing its own scoping session") — SPRINTS.md needs a revision pass
    before Sprint 6 starts, not a silent reconciliation.
  - Not yet pushed to a PR — validated and ready, see Status above.
- **Employer product scope conversation**, before writing any employer
  sprint code. Walked through what the landing page brief actually
  implied technically, then used `AskUserQuestion` on the four decisions
  that would materially change sprint shape (rather than guessing):
  1. **Chat scope** — user chose *chat-first from day one* over my
     recommended default (build structured UI first, add chat as a
     layer later). Means the employer track builds the LLM tool-calling
     loop and chat UI together with each backend action, not deferred.
  2. **Video interviews** — user chose *separate, later initiative*,
     matching my recommendation and the brief's own admission it needs
     its own scoping session. Not in the employer track at all.
  3. **iCompliance** — user chose *employer's own compliance
     checklist/workflow* (the bigger of the three options I offered, not
     just a read-only view of existing candidate data), but interrupted
     the tool result to add: **not urgent, mention in the docs, don't
     schedule it**. Captured as an explicitly unscheduled Sprint 12.
  4. **Pipeline stages** — user chose *fixed stages to start*, matching
     my recommendation.
  - Caught one more compliance issue while designing the search sprint:
    the brief's mockups show partial names ("Aoife M.") in pre-shortlist
    results, which violates non-negotiable #4 (name must be excluded
    pre-shortlist — a first name signals gender/ethnicity, the exact
    Equality Act exposure the rule prevents). This wasn't a question for
    the user — it's enforcing an existing non-negotiable against a
    conflicting mockup, so it went straight into `SPRINTS.md` as a hard
    constraint on Sprint 8, flagged clearly in the chat response rather
    than silently fixed.
  - Rewrote `SPRINTS.md`'s employer track (was Sprints 6–10, now 6–11
    plus an unscheduled Sprint 12) to reflect all four decisions: Sprint
    8 is now "chat infrastructure + compliant candidate search" (LLM
    tool-calling loop, protected-characteristics guardrail, a narrow
    `search_candidates` tool that only produces filter parameters — the
    model never sees or judges candidate data directly, which keeps
    non-negotiable #5 enforceable by construction); Sprint 9 adds the
    `stage` column to `shortlists` (schema doesn't exist yet) plus
    shortlist/pipeline-move/status chat tools; Sprint 10 is the "Who is
    X" summary, deliberately v1-scoped to structured data only so it
    doesn't have to wait on self-expression posts (still phase 2);
    Sprint 11 is bulk chat commands + a minimal dashboard. Updated the
    "explicitly not scheduled" list to match (self-expression posts
    narrowed to just that, since conversational search is now
    scheduled; added video interviews and iCompliance as their own
    entries there too). No code written yet — this was planning only.

## Not started yet
- Employer-side API (profile, verification-request flow, browsing/
  shortlisting published candidates) — deliberately deferred in favor of
  candidate API first. Any employer search view must exclude photo/name/
  video/CV per non-negotiable #4 above.
- Candidate qualifications, DBS records, references, badges, prompts,
  CV import — not covered by the candidate API slice just built. DBS/badge
  copy must follow non-negotiables #2–#3 above when built.
- Candidate self-expression posts + per-post consent model, employer
  conversational AI search + its protected-characteristics guardrail —
  see "Product direction" above. Explicitly phase 2; the guardrail design
  needs care before any of this is built.
- **Supabase email template fix** — the "Magic Link" template needs to
  reference `{{ .Token }}` for `verify-code` to work at all. Manual
  Dashboard step, not yet done (see Stack section). Untested end-to-end
  until this is done — the code is deployed but a real OTP flow hasn't
  been verified against a live inbox yet.
- Candidate paid "boost" feature — will not be built. (Was previously
  listed as blocked-on-legal; now settled as a hard no.)
- Employer-facing landing page — separate piece of work, not started.
- A real signed-in app UI (dashboard, profile editor, etc.) — nothing
  exists yet for a user to land on after authenticating via `/auth/*`.
  The old landing page draft stashed a session in `localStorage` for this;
  the new waitlist-first page doesn't authenticate anyone yet, so that's
  moot until there's a real post-launch flow.
- Employer verification review flow (`employer_verification_requests`,
  `is_verified`) — who reviews these and how is undecided.
- **Custom domain for iCare — now blocking three things**: (1) auth emails
  via Sender.net SMTP relay, (2) the waitlist welcome email
  (`sendTransactionalEmail` in `src/email.ts` is a no-op until this
  exists), (3) cosmetic only — Cloudflare is fine on the free
  `workers.dev` subdomain for now. This is the single next concrete
  unblock that matters most.
- Auth-email templates (signup confirmation, magic link/OTP, invite) —
  not designed or written yet, blocked on the domain above. (No password
  reset template needed — there are no passwords.)
- Sender.net API integration itself — `src/email.ts` has a documented
  stub but the actual transactional-send API call was never looked up/
  written, since sending is blocked on the domain anyway.
