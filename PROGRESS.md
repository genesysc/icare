# iCare — Progress Log

**Read `HANDOVER.md` first** — it's the curated entry point (non-negotiables,
stack, file map, what's built/not, gotchas, open questions). This file is
the detailed chronological session log: consult it for history or specifics
`HANDOVER.md` doesn't cover. Any AI assistant picking up this project — on
any device, any tool — should read both before doing anything, and update
this file before ending a session (update `HANDOVER.md` too if something
changes that a fresh agent needs up front). See `AGENTS.md` / `CLAUDE.md`
for the standing instruction.

## Status: Candidate track complete, merged and deployed; employer track next

PR #9, #10, #11, #12, #13, and now #14 all merged and deployed
(waitlist landing pages, candidate + employer, employer landing page
v2, and Sprints 0-5 of the candidate onboarding journey). `main` is
deployed and live, wired to the real Supabase backend — CI run #15
(https://github.com/genesysc/icare/actions/runs/32966651915) succeeded.
Branch restarted from `main` after the merge per this repo's convention
(see "Conventions" — HANDOVER.md §10).

`SPRINTS.md` was written, then its employer track revised after a scope
conversation (chat-first from day one, fixed pipeline stages, video
interviews split out as a separate initiative, iCompliance scoped but
deliberately unscheduled), then non-negotiable #4 partially overridden
per explicit founder instruction (search results now show name/current
job title/location pre-shortlist — see the dated annotation in §1 and
the "Done" entries below for both). All of that was planning; the user
then said to start building.

**Sprint 0 is now shipped** — `/privacy` and `/terms` pages, a shared
client-side auth helper, and the Magic Link email template confirmed as
still-manual (no Supabase MCP tool touches Auth email config — checked,
not assumed).

**Sprint 1 is now shipped too** — real sign-up/sign-in/verify pages,
calling the existing (unmodified) `/auth/request-code` and
`/auth/verify-code` routes, landing on new stub `/onboarding` and
`/dashboard` pages until Sprints 2 and 5 build the real thing. One real
bug found and fixed during testing (a `history.replaceState` throw that
silently broke the entire sign-up/sign-in mode toggle) — see "Done"
below for detail on both sprints.

**Sprint 2 is now shipped too** — the real onboarding wizard (basics,
skills, availability), replacing the Sprint 1 stub outright, plus two
new backend routes (`onboarding/advance`, `onboarding/complete`) whose
RLS compatibility was checked directly against the schema before writing
them. Deliberately does *not* call `complete` — the wizard spans Sprints
2–5, and `onboarding_done` only means something once all of it exists.
Exercised the actual wizard JS with headless Chromium and mocked API
responses (this sandbox still can't reach Supabase) — confirmed the
full step flow, a conditional field, and resume-from-step-3 all work
correctly, no page errors. See "Done" below for all three sprints' full
detail.

PR #12 (https://github.com/genesysc/icare/pull/12) was opened,
`mergeable_state` confirmed `clean`, squash-merged into `main`, and CI
run #13 confirmed `success`.

**Sprint 3 is now shipped too** — work history, qualifications, and
registrations, continuing the same wizard (now 6 real steps + a holding
screen, was 3 + holding). Employment history's step (4) reuses the
existing full-CRUD API with a new add/edit/delete record-card UI.
Qualifications and registrations got brand-new CRUD routes in
`src/candidates.ts` (plus a qualification evidence-upload route to R2)
and a new public `GET /qualification-types` reference route, all
RLS-checked directly against `pg_policies` before writing them. One
correction against `SPRINTS.md`'s original assumption, caught by
checking the real schema instead of trusting the doc: a new
qualification's `status` starts `none` (DB default), not `submitted` —
it only becomes `submitted` once evidence is actually uploaded, which
matches the enum's own semantics better. Two real layout bugs found and
fixed during the responsive audit (see "Done" below for detail — a
6-label overflow and a record-card action/title overlap), both caught
by rendering populated cards with headless Chromium, not by reading the
CSS. See "Done" below for full detail.

PR #13 (https://github.com/genesysc/icare/pull/13) was opened,
`mergeable_state` confirmed `clean`, squash-merged into `main`, and CI
run #14 confirmed `success`. Branch restarted from `main` per
convention.

**Sprint 4 is now shipped too** — DBS status/consent, references, and
self-expression prompts, continuing the same wizard (now 9 real steps +
a holding screen, was 6 + holding). DBS is a singleton upsert
(`dbs_records.candidate_id` is the primary key), with
`consent_given_at` stamped server-side the moment consent first flips
true — never client-supplied. References reuse the same record-card
CRUD pattern as Sprint 3. Prompts are a new per-`(candidate_id,
prompt_id)` upsert/delete against the 6 real prompts already seeded in
the DB. All RLS-checked directly against `pg_policies` before writing
routes. **Also redesigned the step progress indicator**: the per-step
label row (already patched once in Sprint 3 for 6 labels) wouldn't have
scaled to 9, so it's replaced with a single dynamic "Step X of 9 ·
Label" line above the dots — removes a whole recurring class of
overflow bugs rather than patching it a third time.

**Sprint 5 is now shipped too — the candidate track is complete.** The
wizard's final two steps (photo, review & publish, now 11 real steps
total) plus a real candidate dashboard replacing the Sprint 1 stub.
Reading `publish_my_profile()`'s and `can_publish()`'s actual SQL
before building against them (not just `SPRINTS.md`'s one-line
description) surfaced two things worth knowing: publishing itself sets
`onboarding_done = true` — the dedicated `onboarding/complete` route
from Sprint 2 stays permanently unused by design, publish *is* the
completion signal — and publishing is gated on 4 specific conditions
(profession, employment history, postcode, right-to-work), returning
`published: false` rather than an error if unmet. The review step
mirrors those exact conditions client-side for an honest "still
needed" checklist, and computes a live completeness percentage using
the same 8-factor weights as the DB's `profile_completeness()`
function (read first, not guessed). A new `GET /candidates/me/photo`
route had to be added — there was no way to get an uploaded photo's
bytes back at all before this, for either the wizard's preview or the
dashboard. The dashboard is view-only for individual fields by design:
"Edit" buttons route back into the wizard (now supporting a `?step=N`
override to jump to an already-completed step) rather than duplicating
every edit form a second time. Badges are read-only (`GET
/candidates/me/badges`, joins the `badges` reference table) and
rendered with a genuinely distinct visual treatment per grade — solid
fill for `verified`/`evidenced`, outline for `derived`/`declared`,
different colors each — per non-negotiable #2. Account closure is a
new route wrapping the existing `close_my_account()` RPC, behind a
two-step in-page confirm rather than a native `confirm()` dialog. See
"Done" below for full detail.

PR #14 (https://github.com/genesysc/icare/pull/14) was opened,
`mergeable_state` confirmed `clean`, squash-merged into `main`, and CI
run #15 confirmed `success`. Branch restarted from `main` per
convention. **The candidate track is done.** Next: Sprint 6 starts the
employer track.

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
- **Non-negotiable #4 partially overridden — explicit founder
  instruction, 2026-08-26.** User: *"Regarding non-negotiables, i
  command you to not let it interfere with planning for now. When the
  employer searches the ai should generate the names, current job title
  and location of the candidate."* This directly reverses the
  identity-blind pre-shortlist search design #4 required (photo/name/
  video/CV excluded until shortlist+consent) — the original rule came
  from real legal-compliance handover material (Equality Act 2010
  indirect-discrimination exposure: a name signals gender/ethnicity),
  not something invented mid-session, so this wasn't treated as a routine
  planning tweak. Flagged the risk clearly once — not repeatedly, since
  the instruction was explicit and directed — then implemented as asked
  rather than blocking on it. Scoped the override narrowly to exactly
  what was requested: **name, current job title, and location** are now
  shown pre-shortlist; **photo, video, and CV file stay excluded** —
  those three weren't mentioned in the instruction, so non-negotiable #4
  still applies to them. Recorded as a dated, attributed annotation in
  `HANDOVER.md` §1 non-negotiable #4 (original compliance reasoning kept
  intact, not deleted, so it's there if this ever gets revisited) and
  reflected in `SPRINTS.md`: Sprint 8's result fields now include
  `accounts.full_name` (joined via `candidates.id = accounts.id`) and
  current job title (`employment_history` row where `is_current = true`);
  Sprint 9's candidate-consent unlock now covers photo/video/CV only,
  since name/title/location are already visible from search rather than
  gated behind consent.
- **Sprint 0 shipped** (`SPRINTS.md`): the foundations candidate Sprint 1
  onward depends on.
  - `src/privacy.html` and `src/terms.html` — self-contained pages
    matching the landing pages' pattern, linked from both landing
    pages' footers. Explicitly marked DRAFT with an on-page notice, not
    just in the source comments — grounded in real system behavior
    (including the Sprint 8 name/title/location override, described
    honestly rather than as an idealised identity-blind design) rather
    than generic boilerplate, but not lawyer-reviewed. Placeholders
    (company registration details, contact email, retention period,
    governing law) are bracketed and colored distinctly on the page,
    not invented as if settled.
  - Checked whether the Supabase Magic Link email template fix could be
    done from here (queried the actual list of available Supabase MCP
    tools rather than assuming) — confirmed no tool exposes Auth email
    template config. Still a manual Dashboard step for the user.
  - `src/auth-client.js` — the shared client-side auth helper, written
    as a canonical reference file (not imported — this repo has no
    build step, so every signed-in page copies it into its own
    `<script>` tag verbatim, matching how the landing pages already
    duplicate their reveal/share-panel JS rather than importing it).
    `icareGetSession`/`icareSetSession`/`icareClearSession`
    (localStorage), `icareAuthFetch` (attaches the bearer token),
    `icareRequireAuth` (redirect-to-sign-in with `?next=` if no valid
    session).
  - Verified: `tsc --noEmit` clean (confirmed `auth-client.js` isn't
    picked up by `tsconfig.json`'s default `allowJs: false`, so it's
    inert until copied into a page — checked the config rather than
    assuming), `wrangler deploy --dry-run` bundles cleanly, 6-viewport
    headless-Chromium audit on both new pages — zero horizontal overflow.
  - Not yet pushed to a PR.
- **Sprint 1 shipped** (`SPRINTS.md`): real candidate sign-up/sign-in.
  - `src/sign-in.html` — one file mounted at both `/sign-up` and
    `/sign-in`, client-side mode toggle (name field + terms checkbox
    only show in sign-up mode). Posts to the existing, unmodified
    `POST /auth/request-code` — no backend changes this sprint.
  - `src/verify.html` — 6-digit code entry, posts to the existing,
    unmodified `POST /auth/verify-code`, stores the session via the
    Sprint 0 auth helper (copied inline). On success, calls the
    existing `GET /candidates/me` to check `onboarding_done` and
    redirects to `/onboarding` or `/dashboard` accordingly.
  - `src/onboarding.html`, `src/dashboard.html` — new stub pages, both
    just enough to be real, working, auth-guarded destinations (confirm
    the account, show the signed-in email, offer sign-out) since Sprints
    2 and 5 don't exist yet and Sprint 1 needs non-broken redirect
    targets either way. Both reuse the same `icareRequireAuth` guard
    the real pages will keep using.
  - **Bug found and fixed during testing, not just a lucky catch**:
    tested the sign-up/sign-in mode toggle with a headless-Chromium
    click (not just visual inspection) and found `history.replaceState`
    throwing uncaught in the tested context — which silently aborted
    the rest of the page's init script, meaning the toggle's click
    handlers never got attached at all, with zero visible error. Wrapped
    in try/catch; re-tested and confirmed the toggle switches correctly
    (name field + terms checkbox appear, copy updates, body class
    updates) after the fix.
  - **Explicitly not testable from this sandbox**: a live OTP round-trip
    (send code → real inbox → verify). Confirmed — again, more directly
    this time — that this sandbox can't reach `*.supabase.co` at all:
    tried a plain `curl` directly (not just `wrangler dev`), got no
    response (`000`). This is the same limitation `HANDOVER.md` §6
    already flagged (OTP flow deployed but unconfirmed against a real
    inbox, pending the Magic Link template fix), not something new or
    worse introduced by this sprint. What's actually verified instead:
    the request/response shapes used match the real, unmodified
    `src/auth.ts`/`src/candidates.ts` exactly (read the source, not
    assumed), plus `tsc --noEmit`, `wrangler deploy --dry-run`, and a
    6-viewport headless-Chromium audit across all 4 new pages (zero
    horizontal overflow).
  - Not yet pushed to a PR.
- **Sprint 2 shipped** (`SPRINTS.md`): the real onboarding wizard.
  - **New routes** (`src/candidates.ts`): `POST /candidates/me/
    onboarding/advance` (`{ step, event }`, bumps `onboarding_step` to
    `max(current, step)`, always inserts an `onboarding_events` row) and
    `POST /candidates/me/onboarding/complete` (sets `onboarding_done =
    true`, logs a `completed` event) — built but deliberately **not
    called by this sprint's UI**, since the wizard spans Sprints 2–5 and
    calling `complete` after just 3 of the eventual ~10+ steps would
    misrepresent what `onboarding_done` means to anything that checks it
    (Sprint 1's verify.html redirect logic, for one).
  - Checked RLS directly against the schema before writing either route,
    not assumed: `candidates`' `candidate_self` policy (`id =
    auth.uid()`, all commands) covers the read+update; `onboarding_
    events`' `onboarding_events_self` policy (INSERT only, `candidate_id
    = auth.uid()`) covers the insert.
  - `src/onboarding.html` replaced outright (was the Sprint 1 stub): 3
    steps in one page — Basics (headline/about/town/postcode_district +
    a profession picker with a primary-profession dropdown that only
    appears once 2+ professions are checked), Skills (clinical skills
    grouped by family), Availability & logistics (availability state
    with a conditional date field, shift prefs, travel radius, min rate,
    right-to-work with a conditional visa-expiry field, driving licence/
    vehicle). Progress dots + labels, back/next, and — genuinely
    resumes from `candidates.onboarding_step` on load rather than
    restarting, by fetching the candidate's existing profile/
    professions/skills and pre-filling/pre-checking everything.
  - After step 3: an honest "rest of the wizard — coming soon" holding
    screen, not a redirect anywhere and not `onboarding_done = true`.
  - **Verification approach, given this sandbox still can't reach
    Supabase**: rather than stop at typecheck/bundle/overflow-audit
    (which don't prove the JS actually works), exercised the real
    wizard with headless Chromium, mocking `fetch` responses shaped
    exactly like the real endpoints' real shapes (read from the actual
    route handlers, not guessed) via Playwright's request interception.
    Confirmed: the full step 1→2→3→4 click-through advances correctly
    with no uncaught page errors; the conditional visa-expiry field
    shows/hides correctly when `right_to_work` changes to/from a visa-
    related value; and, separately, mocking `onboarding_step: 3` on load
    lands the wizard on step 3 directly rather than restarting at step
    1 — the resume behavior actually works, not just plausible-looking
    code. Also: `tsc --noEmit` clean, `wrangler deploy --dry-run` bundles
    cleanly, 6-viewport headless-Chromium overflow audit (zero overflow).
- **PR #12 opened, merged, and deployed** (squash-merged into `main`,
  `mergeable_state` confirmed `clean` before merging): employer landing
  page v2, `SPRINTS.md`, the non-negotiable #4 override annotation, and
  Sprints 0-2 (privacy/terms pages, auth helper, sign-up/sign-in/verify
  pages, and the real onboarding wizard) all now live on `main`. CI run
  #13 (https://github.com/genesysc/icare/actions/runs/32938882643)
  confirmed `success`. Branch restarted from `main` per convention.
- **Sprint 3: work history, qualifications, registrations** — the
  wizard's steps 4-6, replacing the Sprint 2 holding screen (now step 7).
  - **Employment history (step 4)**: reused the existing full-CRUD
    `/candidates/me/employment-history` API outright — no backend
    changes needed. New wizard UI: a record-card list (job title ·
    employer, setting, date range) with a single reusable inline
    add/edit form (employer, job title, setting, started/ended dates,
    "I still work here" checkbox that hides the ended-date field,
    description). Each save/delete calls the API immediately and
    re-fetches the list, rather than batching changes for a later
    "Continue" — matches how the professions/skills pickers already
    work, and means nothing is lost if someone abandons the wizard
    mid-step.
  - **Qualifications (step 5)**: **new routes** in `src/candidates.ts`
    — `GET/POST /candidates/me/qualifications`,
    `PATCH/DELETE .../:id`, and `POST .../:id/evidence` (R2 upload,
    same `Content-Type`-must-be-image-or-pdf pattern as the existing
    candidate photo route). RLS checked directly against
    `pg_policies` (`qualifications_self`, `candidate_id = auth.uid()`,
    `ALL`) before writing them — matches exactly. New public
    `GET /qualification-types` route (same pattern as `/professions`/
    `/skills`) populates a grouped-by-family `<select>`.
    **Correction against `SPRINTS.md`'s original assumption**: checked
    the real schema instead of trusting the doc, and a new
    qualification's `status` actually defaults to `none`, not
    `submitted` — it only moves to `submitted` once evidence is
    genuinely uploaded (handled server-side in the evidence route,
    `none → submitted` on first upload, doesn't touch it if evidence is
    replaced later). This reads truer to the enum's own semantics
    (`none → submitted → under_review → accepted/rejected/expired`)
    than "submitted the moment a title is typed in." `SPRINTS.md`
    corrected to match.
  - **Registrations (step 6)**: **new routes**, same CRUD shape —
    `GET/POST /candidates/me/registrations`, `PATCH/DELETE .../:id`.
    RLS checked the same way (`registrations_self`, plus a separate
    `registrations_shortlisted` policy for employer visibility after
    consent — out of scope for this sprint, not touched). `status`
    defaults to `submitted` (matches `SPRINTS.md`'s original
    assumption this time) — a registration is a factual claim
    (regulator + reg number) made up front, unlike a qualification.
  - **Two real layout bugs found and fixed** during the 6-viewport
    responsive audit (rendered actual populated record cards with
    headless Chromium, not just read the CSS):
    - The step-label row (expanded from 3 labels to 6 for the new
      steps) overflowed horizontally below ~390px — `justify-content:
      space-between` doesn't let text shrink. Fixed by giving each
      label an equal flex column (`flex: 1; min-width: 0`) so long
      words wrap within their own column instead of forcing the row
      wider than its container.
    - A qualification/registration record card's action buttons
      ("Add evidence", "Edit", "Delete") overlapped the title text
      when both didn't fit on one row — `.record-main` had no flex
      sizing, so the fixed-width actions squeezed it into a sliver.
      Fixed with `flex-wrap: wrap` on the card plus an explicit
      `flex-basis` on `.record-main`, so actions drop to their own
      line instead of overlapping.
  - **Verification**: `tsc --noEmit` clean, `wrangler deploy --dry-run`
    bundles cleanly, RLS checked directly against `pg_policies` for
    both new tables before writing routes, and the full step 4→5→6→7
    flow (add/edit/delete on all three record types, the evidence
    upload transitioning `none → submitted`, and resume-on-step-4 for
    an account that finished Sprint 2) exercised with headless
    Chromium + mocked API responses — no uncaught page errors, correct
    state after every action. 6-viewport overflow audit re-run after
    the two CSS fixes: zero horizontal overflow at any tested size.
- **PR #13 opened, merged, and deployed** (squash-merged into `main`,
  `mergeable_state` confirmed `clean` before merging): Sprint 3 (work
  history, qualifications, registrations) now live on `main`. CI run
  #14 (https://github.com/genesysc/icare/actions/runs/32941646689)
  confirmed `success`. Branch restarted from `main` per convention.
- **Sprint 4: DBS status/consent, references, self-expression prompts**
  — the wizard's steps 7-9, replacing the Sprint 3 holding screen (now
  step 10).
  - **DBS status + consent (step 7)**: **new routes** —
    `GET/PUT /candidates/me/dbs`. Checked the schema before assuming
    anything: `dbs_records`' primary key is `candidate_id` itself (one
    row per candidate), so the route is a true upsert
    (`.upsert(update, { onConflict: "candidate_id" })`), not list CRUD
    like the Sprint 3 tables. `level` is `NOT NULL` with no DB default,
    so the route only writes a row when the candidate actually picks a
    level — leaving the picker on "I don't have one yet" and hitting
    Continue advances the wizard without touching the table at all
    (verified: `dbsRow` stayed `null` in the mocked test after a
    skip-continue). `consent_given_at` is entirely server-owned: the
    route reads the existing row first, and only stamps a fresh
    `new Date().toISOString()` when `consent_to_check` is arriving as
    `true` for the *first* time (i.e. it was previously false/absent);
    if consent is unchecked, `consent_given_at` is cleared to `null`.
    This means the timestamp is an honest record of when consent was
    actually given, never something the client could backdate or fake.
    UI copy uses exactly the non-negotiable #3 wording ("Enhanced DBS",
    "I'm registered on the DBS Update Service") and never
    "verified/certified/checked"; the certificate-number field carries
    an explicit "kept private, never shown pre-shortlist" hint.
  - **References (step 8)**: **new routes**, full CRUD
    (`GET/POST /candidates/me/references`, `PATCH/DELETE .../:id`),
    same record-card add/edit/delete UI pattern as Sprint 3's
    qualifications/registrations. RLS checked directly against
    `pg_policies` (`candidate_references_self`, `candidate_id =
    auth.uid()`, `ALL`) before writing them. Only referee details are
    collected this sprint — the actual referee-response flow
    (`candidate_references.token`, an email to the referee) is still
    deferred, since it needs real outbound email and that's blocked on
    the parked domain/Sender.net work (documented as a flagged
    dependency in `SPRINTS.md`, not silently dropped).
  - **Self-expression prompts (step 9)**: **new routes** —
    `GET /candidates/me/prompts`, `PUT/DELETE
    /candidates/me/prompts/:promptId`. Schema check here mattered too:
    `candidate_prompts`' primary key is the composite
    `(candidate_id, prompt_id)`, so `PUT` is an upsert scoped to that
    pair (`onConflict: "candidate_id,prompt_id"`), and clearing an
    answer calls `DELETE` rather than storing an empty string. New
    public `GET /prompts` reference route (same pattern as
    `/professions`/`/skills`/`/qualification-types`) serves the 6 real
    prompts already seeded in the DB — genuine content
    ("Something I'm good at that isn't on my CV", "Why I went into
    care", etc.), not placeholders invented for this sprint. Answering
    any given prompt is optional; the wizard step doesn't require a
    minimum count. On Continue, the step diffs each textarea against
    its loaded value and only fires the network calls for prompts that
    actually changed (unchanged textareas are skipped, not
    re-submitted).
  - **Progress-indicator redesign**: the per-step label row (patched
    once already in Sprint 3, when it grew from 3 labels to 6 and
    started overflowing at narrow widths) was heading toward the same
    failure again at 9 labels. Rather than patch it a third time,
    replaced the whole row with a single dynamic line above the dots —
    `"Step 7 of 9 · DBS & consent"` — computed from a
    step-number-to-label lookup in `showStep()`. The dots themselves
    (no text, just background color) don't have the shrinking-text
    problem the labels did, so they stayed as-is, just extended from 6
    to 9. This removes the recurring bug class outright rather than
    re-fixing it, and scales cleanly for Sprint 5's remaining steps.
  - **Verification**: `tsc --noEmit` clean, `wrangler deploy --dry-run`
    bundles cleanly, RLS for all three new/changed tables checked
    directly against `pg_policies` before writing routes, and the full
    step 7→8→9→10 flow exercised with headless Chromium + mocked API
    responses — confirmed: skipping DBS writes nothing, filling DBS
    persists exactly the fields sent plus the correct
    server-stamped consent timestamp, adding/editing a reference
    round-trips correctly, answering one prompt and leaving another
    blank results in exactly one row server-side, and resume lands
    directly on step 7 for an account that finished Sprint 3. No
    uncaught page errors. 6-viewport overflow audit (with every new
    step populated with real-shaped data, including a filled reference
    card and an answered prompt) — zero horizontal overflow at any
    tested size.
- **Sprint 5: photo, review, publish, candidate home** — the wizard's
  final two steps (10-11) plus a real candidate dashboard, replacing
  the Sprint 1 stub outright. **Candidate track complete.**
  - **Photo (step 10)**: reuses the existing `POST /candidates/me/
    photo`, but there was no way to get the bytes back — no route
    served R2 objects at all. New `GET /candidates/me/photo`, scoped
    to the caller's own key (`candidates/{userId}/photo`, derived from
    the verified JWT, never client-supplied) rather than a general
    `/media/:key` route, so there's no key-enumeration surface. Skips
    cleanly if the candidate doesn't add one — completeness treats it
    as optional (10 of 100 points), `can_publish()` doesn't require it.
  - **Review & publish (step 11)**: before writing anything, read the
    actual SQL of `publish_my_profile()` and `can_publish()` rather
    than building against `SPRINTS.md`'s one-line description. That
    surfaced two things the doc didn't know: (1) `publish_my_profile()`
    already sets `onboarding_done = true` on success — meaning the
    dedicated `POST /candidates/me/onboarding/complete` route built in
    Sprint 2 and deliberately never called is now confirmed to stay
    unused *by design*, forever — publishing itself is the completion
    signal, not a separate step; (2) publishing is gated by
    `can_publish()`, which requires exactly four things (a profession,
    an employment-history entry, a postcode district, and a
    right-to-work status that isn't `not_stated`) and returns
    `published: false` — not an HTTP error — if any are missing. The
    review step mirrors those exact four conditions client-side
    (`renderPublishChecklist()`) to show a specific, honest "still
    needed" list rather than a generic failure message, and computes a
    live completeness percentage using the identical 8-factor point
    breakdown as the DB's `profile_completeness()` function (professions
    15, postcode 10, availability 10, right-to-work 10, employment 20,
    DBS 10, prompts 15, photo 10), read from the function body, not
    guessed or approximated. Each summary row has an inline "Edit" link
    that calls `showStep(N)` directly (same page, already-loaded data,
    no refetch).
  - **Candidate dashboard** (`src/dashboard.html`, full rewrite):
    loads the profile, professions, employment history, qualifications,
    registrations, DBS, references, prompts, and badges in one
    `Promise.all`, then renders a profile-summary card, a badges
    section, a compact "profile at a glance" section list, and account
    settings. Deliberately **view-only for individual fields** — no
    second copy of every edit form. Instead, "Edit" links point at
    `/onboarding?step=N`, and `onboarding.html` gained a new `?step=`
    query override: it normally always resumes at the highest step
    reached, but now, if a valid `step` param names an
    already-completed step, it jumps there instead — a small, targeted
    addition that reuses every per-step form already built rather than
    duplicating them. New `GET /candidates/me/badges` (read-only, joins
    the `badges` reference table for `label`/`grade`/`family`/
    `description` — confirmed the FK from `candidate_badges.badge_code`
    to `badges.code` exists before relying on the embed syntax, same
    pattern already proven working by the existing `/me/professions`
    route's `professions(...)` embed). Badges render grouped by family
    with a genuinely distinct visual treatment per grade — solid fill
    for `verified` (teal) and `evidenced` (plum), outline for `derived`
    (teal) and `declared` (amber) — per non-negotiable #2, not just
    different text labels on an identical chip.
  - **Account settings**: new `POST /candidates/me/close-account`
    wraps the existing `close_my_account()` RPC (confirmed callable by
    the `authenticated` role via `has_function_privilege` before
    relying on it). UI is a two-step in-page confirm (click reveals a
    warning + a second confirm button) rather than a native `confirm()`
    dialog — easier to test and a more consistent look than a native
    dialog. Copy is honest about what the RPC actually does (unpublishes
    the profile, marks the account closed, logs a closure request) —
    doesn't claim it deletes data, since it doesn't.
  - **Verification**: `tsc --noEmit` clean, `wrangler deploy --dry-run`
    bundles cleanly, the `candidate_badges → badges` foreign key and
    `close_my_account`/`publish_my_profile` execute privileges checked
    directly against the schema before relying on them. Exercised with
    headless Chromium + mocked API responses: resume-on-step-10 for an
    account that finished Sprint 4; the exact completeness percentage
    (65% for a profile with profession/postcode/availability/
    right-to-work/employment but no DBS/prompts/photo — matches the
    formula by hand-calculation); the publish-blocked path (all 4
    checklist items appear correctly for an empty profile, status
    message shown, no redirect); the publish-succeeds path (redirects
    to `/dashboard`); the photo upload round-trip (correct
    `Content-Type`, preview updates without a page reload); and the
    dashboard's badge rendering (3 badges, 3 distinct grade classes),
    section list (7 rows, correct `?step=N` hrefs), and close-account
    confirm flow. No uncaught page errors anywhere. 6-viewport overflow
    audit on both the review step and the dashboard (populated with
    real-shaped data, including the DBS badge's long label) — zero
    horizontal overflow at any tested size.
- **PR #14 opened, merged, and deployed** (squash-merged into `main`,
  `mergeable_state` confirmed `clean` before merging): Sprint 5 (photo,
  review, publish, candidate dashboard) now live on `main`. CI run #15
  (https://github.com/genesysc/icare/actions/runs/32966651915)
  confirmed `success`. Branch restarted from `main` per convention.
  **Candidate track complete end to end, live in production.**
- **Candidate-side UI/copy review pass** — the user asked to pause sprint
  work and review every candidate screen visually. Rendered all 16
  screens (landing → sign-up/sign-in → verify → all 11 wizard steps →
  dashboard) with headless Chromium against one consistent realistic
  test profile (Registered Nurse, 8 years' experience, fully populated
  across employment/qualifications/registrations/DBS/references/
  prompts) and published them as an artifact for review, with exact
  on-screen copy quoted for the compliance-sensitive screens. Two fixes
  came out of that review:
  - **Professions picker (step 1)**: was a flat checkbox grid, which
    read as carer/nurse-dominated even though the real `professions`
    table already has 28 professions across 6 families (Social care,
    Nursing, Allied health, Dental, Pharmacy, Support) — the gap was
    presentation, not data. Rewritten as a grouped `<select>` dropdown
    (optgroups by family, matching the qualification-type picker's
    existing convention) + removable chips for what's picked, with a
    "Primary" tag on whichever chip matches the primary-profession
    selection. Field hint copy now states the breadth explicitly
    ("From care roles to nursing, allied health, dentistry, and
    pharmacy..."). A real ordering bug was caught and fixed while
    building this: the primary-tag logic read the primary `<select>`'s
    value *before* its options were rebuilt for the new pick, so it
    lagged a render behind — fixed by rebuilding the select first, then
    reading its settled value for the chip tags.
  - **DBS status wording (step 7)**: the non-negotiable #3 phrase
    ("Enhanced DBS · on Update Service") was never actually shown
    together as one line during data entry — only as two separate
    inputs (a level dropdown, a separate Update Service checkbox), with
    the combined phrase only appearing later as a badge label. Added a
    live preview line under the Update Service checkbox that composes
    the exact phrase from the current level + checkbox state and states
    the "never verified/certified, only the Update Service can confirm"
    rule in plain language, updating live as either input changes.
  - Verified: `tsc --noEmit` clean, `wrangler deploy --dry-run` bundles
    cleanly, both flows exercised with headless Chromium (multi-pick,
    remove-by-chip, primary-reassignment for professions; all 4 DBS
    level/update-service combinations for the preview text), zero
    horizontal overflow at 3 viewport widths including the longest DBS
    label case.
  - Not yet pushed as a PR — this is a fix within the review pause, not
    a new sprint; will fold into whichever sprint's PR comes next unless
    the user asks to ship it separately.
- **CV import (upload → parse → review → apply)** — the user's original
  request from the very start of onboarding planning, picked up during
  the review pause rather than deferred to the employer track. The
  `cv_imports` table was already fully modeled in the schema (`status`
  lifecycle `uploaded→parsing→parsed→review_complete/failed/unreadable`,
  `confidence`, `sensitive_found` columns) — confirms this was designed
  intent, not new scope invented mid-session.
  - **Backend** (`src/candidates.ts`): `POST /candidates/me/cv` (body:
    raw PDF, `Content-Type: application/pdf`, max 8MB) inserts a
    `cv_imports` row (`status: "parsing"`), stores the file in R2
    (`candidates/{id}/cv/{importId}.pdf`), then calls the Claude API
    (`@anthropic-ai/sdk`, model `claude-opus-5`) with the PDF as a
    `document` content block and a single forced tool call
    (`tool_choice: {type:"tool", name:"extract_cv_data"}`, `strict:
    true`) to extract headline/about/town, profession/skill ids,
    employment history, qualifications, registration, and which
    sensitive categories were noticed. **Architectural enforcement of
    non-negotiable #5** (never auto-apply an AI parse): this route only
    ever writes to `cv_imports` — it never touches `candidates`,
    `employment_history`, `candidate_professions`, or any other profile
    table. Those are only written later, by the candidate's own "Apply"
    click on the review screen, which calls the exact same
    already-built, already-RLS-scoped routes a manual-entry candidate
    uses (`PATCH /candidates/me`, `PUT .../professions`, `PUT
    .../skills`, `POST .../employment-history`, `POST
    .../qualifications`, `POST .../registrations`), one call per item
    the candidate left checked.
  - **Non-negotiable #6 (data minimisation) enforced two ways**: (1) the
    system prompt explicitly forbids extracting DOB, nationality,
    immigration/visa status, marital status, gender, religion,
    ethnicity, health info, NI number, or photo — anywhere, including
    inside free-text fields — and instead instructs the model to flag
    the category in `sensitive_categories_noticed`; (2) the tool's JSON
    Schema has no field that could carry those values at all, so even a
    model mistake has nowhere structurally to put them. The review
    screen surfaces `sensitive_found` as an explicit notice ("We noticed
    but didn't extract: date of birth, nationality — add them yourself
    only where the platform actually asks").
  - **No fuzzy-matching step needed, by construction**: `profession_ids`/
    `skill_ids`/`qualification type_id`/`registration.regulator` are
    constrained as JSON Schema `enum`s built from the live
    `professions`/`clinical_skills`/`qualification_types` tables (plus a
    fixed 7-regulator list) at request time, so the model can only ever
    return ids that already exist in our system — no separate
    reconciliation pass between "what the model guessed" and "what's
    actually in the DB".
  - `GET /candidates/me/cv/latest` and
    `POST /candidates/me/cv/:id/mark-applied` round out the lifecycle
    (the latter stamps `status: "review_complete"` + `applied_at` once
    the candidate confirms).
  - **Frontend** (`src/onboarding.html`): restructured the page's DOM
    into three top-level screens — a CV intro (choose "Upload my CV" vs.
    "Fill it in myself"), an upload zone + parsing spinner, and a review
    screen — shown only on a genuine first visit (`onboarding_step === 1`
    and no `?step=` override); returning via an explicit step link still
    goes straight to the wizard. The review screen is fully editable
    before anything is written: text inputs for headline/about/town,
    removable-style checkbox chips for professions/skills (default
    checked), and a checkbox-per-entry card list for employment history/
    qualifications/registrations (default checked, uncheck to drop an
    item) — "Looks good — continue" only submits what's still checked.
    After a successful apply, the page reloads to `/onboarding?step=1`
    (not a bare `/onboarding`) specifically so the candidate lands on
    their now-pre-filled Step 1 form instead of seeing the CV-choice
    screen again — `onboarding_step` itself doesn't advance until the
    candidate clicks Continue on step 1 for real.
  - **Config**: added `"compatibility_flags": ["nodejs_compat"]` to
    `wrangler.jsonc` — required because `@anthropic-ai/sdk`'s
    credential-chain module has static top-level imports of `node:fs`/
    `node:path` (used for `ant auth login` profile auth, unused here
    since this route passes `apiKey` explicitly, but the import still
    executes at module load). Confirmed via `wrangler deploy --dry-run`:
    warned before the flag, clean after.
  - **Verified**: `tsc --noEmit` clean against the real installed SDK
    types; `wrangler deploy --dry-run` bundles cleanly (~1.49MB / 311KB
    gzip). Exercised end-to-end with headless Chromium and a mocked
    upload response shaped exactly like the real endpoint's real output:
    intro screen shows on first load, choosing upload reveals the file
    picker, submitting shows the parsing spinner then the review screen
    with every field/chip/card correctly pre-filled from the mock,
    unchecking one of two employment entries before applying results in
    exactly 1 (not 2) `employment-history` POST firing and `mark-applied`
    being called — confirms partial-apply (keep some entries, drop
    others) actually works, not just full-apply. 5-viewport overflow
    audit (375/430/768/1280/1920px) across the intro, upload-zone, and
    review screens — zero horizontal overflow at any size.
  - **⚠️ Blocked on provisioning `ANTHROPIC_API_KEY`**: this route needs
    an `ANTHROPIC_API_KEY` secret (`wrangler secret put
    ANTHROPIC_API_KEY`) to actually call Claude in production. This
    session's local `wrangler` has no live Cloudflare authentication
    (`wrangler whoami` → "You are not authenticated") — checked directly
    rather than assumed — so the secret can't be provisioned from here
    even with a key value supplied. The user (or CI, or an authenticated
    session) needs to run `wrangler secret put ANTHROPIC_API_KEY`
    against the real `icare` Worker before this feature works live; the
    route is otherwise complete and deployable as-is (it'll just 500 on
    the Claude call until the secret exists).
  - Not yet pushed as a PR — same review-pause status as the professions/
    DBS fixes above.
- **Sprint 6: employer sign-up / sign-in UI** — the employer track's
  first sprint, resumed after the review pause. Read
  `handle_new_user()`'s real SQL before assuming anything needed to be
  built server-side, and it surfaced something useful: an employer
  signup **already** creates both the `employers` row (`org_name`,
  `is_verified: false`) and an `employer_verification_requests` row
  (`submitted_org_name`, `submitted_email`) automatically — so Sprint 6
  itself needs zero new backend routes, exactly as `SPRINTS.md` scoped
  it, and Sprint 7's job is reviewing/completing that request, not
  creating it from scratch.
  - **`src/employer-sign-in.html`** (new): same one-file sign-up/sign-in
    toggle pattern as `src/sign-in.html`, but re-themed to match
    `employers.html`'s own purple/teal design system (`--purple:
    #330072`, `--teal: #00a499`) rather than reusing the candidate
    pages' plum/teal palette, and with an organisation-name field added
    alongside name/email at signup. Posts the existing
    `POST /auth/request-code` with `role: "employer"`. Mounted at both
    `/employer/sign-up` and `/employer/sign-in`.
  - **`src/verify.html`** (shared, not duplicated): gained an optional
    `?role=` query hint, set by whichever sign-in page redirected here.
    It only steers cosmetic bits — the "use a different email" link
    target and the offline-fallback landing page if `/auth/me` can't be
    reached — never the actual post-verify redirect, which now calls the
    **existing** `GET /auth/me` first and branches on the account's real
    `role`: employers go to the new `/employer/home`, candidates keep
    the exact same `onboarding_done`-based `/onboarding` vs `/dashboard`
    check as before. This was a deliberate choice over building a
    separate `employer-verify.html` — one shared page, avoids
    duplicating the whole verification form a second time.
  - **`src/employer-home.html`** (new stub): the non-broken landing
    target for a signed-in employer — the same role Sprint 1's
    `onboarding.html`/`dashboard.html` stubs played for candidates
    before later sprints replaced them. Deliberately minimal, matching
    Sprint 6's actual scope: greets by name via the existing
    `GET /auth/me` (no new route needed just to say hello), shows a
    static "Verification: pending" status line and a 3-item roadmap
    card (organisation verification → chat search → pipeline). Sprint 7
    onward replaces its body outright, same as Sprint 2 replaced the
    candidate stub.
  - **Cross-links added both directions**: candidate sign-in now shows
    "Hiring instead? Employer sign in", employer sign-in shows "Looking
    for work instead? Candidate sign in" — someone who lands on the
    wrong audience's page isn't stuck re-typing a URL.
  - **Left alone on purpose**: the `/employers` marketing/waitlist page
    itself — no CTA there points at the new real sign-up flow yet, same
    as the candidate landing page was left unlinked to `/sign-in` after
    Sprint 1. Pre-launch marketing and the real signed-in product stay
    deliberately separate until the user decides to connect them.
  - **Verified**: `tsc --noEmit` clean, `wrangler deploy --dry-run`
    bundles cleanly (~1.51MB / 314KB gzip). Exercised with headless
    Chromium against mocked `/auth/verify-code` + `/auth/me` responses:
    an employer login correctly redirects to `/employer/home` and
    **never** calls `/candidates/me`; a candidate login is unaffected
    (still redirects to `/onboarding` or `/dashboard` based on
    `onboarding_done`, both branches re-confirmed as a regression
    check); the unauthenticated `employer-home.html` guard correctly
    redirects to `/employer/sign-in?next=...`; the signup form's actual
    POST payload confirmed `role: "employer"` plus the typed
    organisation name both reach the server correctly, unmodified.
    (`window.location.href` navigation itself can't complete under
    `file://` in this sandbox — there's no server behind those paths —
    so redirects were verified via the attempted navigation request's
    URL rather than the final loaded page; same limitation already
    documented elsewhere in this file, not new.) 5-viewport overflow
    audit across all 4 new/changed pages, including the employer form in
    both its sign-in and sign-up states — zero horizontal overflow
    anywhere.
  - Not yet pushed as a PR.
- **PR #15 opened, merged, and deployed** (squash-merged into `main`,
  `mergeable_state` confirmed `clean` before merging): bundles all three
  pieces above — the professions/DBS review-pause fixes, CV import, and
  Sprint 6 (employer sign-up/sign-in) — now live on `main`. CI run #16
  (https://github.com/genesysc/icare/actions/runs/33000995853) confirmed
  `success`. Branch restarted from `main` per convention. The
  `ANTHROPIC_API_KEY` provisioning blocker for CV import is called out in
  the PR body as follow-up work, not silently dropped.
- **Sprint 7: employer verification flow** — the employer track's second
  sprint. Checked the real schema before writing anything, same
  discipline as every prior sprint, and it surfaced the actual shape of
  the gate: `employers.is_verified` (not `employer_verification_requests
  .status`) is what the **existing** `is_verified_employer()` RPC
  checks, and a DB trigger (`lock_employer_verification()`) enforces
  that only `service_role` can ever flip it — reading its real SQL
  first confirmed the app layer can never accidentally grant
  verification, even by bug. `employer_verification_requests` itself is
  append-only by RLS (INSERT + SELECT only, confirmed no UPDATE policy
  exists, and no unique constraint on `employer_id`) — each submission
  is a new audit row, not an edit of a previous one, matching the
  `evidence_status` enum's own `submitted → under_review →
  accepted/rejected/expired` lifecycle.
  - **New `src/employers.ts`** router, mounted at `/employers`:
    - `GET /employers/me` — the employer's own row
      (`org_name`/`cqc_provider_id`/`is_verified`) plus their full
      verification-request history (newest first), so the UI can show
      not just current status but why a rejection happened.
    - `POST /employers/me/verification-requests` — submits or
      re-submits for review. Requires at least one of a CQC provider ID
      or Companies House number (validated server-side, not just in the
      UI). `submitted_org_name`/`submitted_email` are stamped
      server-side from the employer's own current `employers`/
      `accounts` rows rather than trusted from the client — same
      philosophy as the DBS route's server-stamped `consent_given_at`
      from Sprint 4. When a CQC provider ID is supplied, also updates
      the live `employers.cqc_provider_id` so the "currently claimed"
      value and the latest submission never drift out of sync.
    - A `PATCH /employers/me` general-profile-edit route was drafted
      and then deliberately removed before committing — nothing in this
      sprint's UI called it (the verification POST route already keeps
      `cqc_provider_id` current), and adding an unused route wasn't
      warranted by this sprint's actual scope.
  - **UI** (`src/employer-home.html`, replacing Sprint 6's static
    "Verification: pending" line with a real, data-driven card): four
    distinct visual states, each with its own copy and status-row
    color — no identifier submitted yet (amber, prompts for one),
    submitted/under review (amber), rejected (red, shows the
    `reviewer_note` verbatim if present), and verified (teal, the form
    disappears entirely — nothing left to submit). The CQC ID field
    pre-fills from the employer's current claimed value on every load,
    so resubmitting after a rejection doesn't mean retyping it.
  - Review stays entirely manual via the Supabase dashboard for now —
    same reasoning as Sprint 3's qualifications/registrations — no admin
    review UI in this sprint.
  - **Verified**: `tsc --noEmit` clean, `wrangler deploy --dry-run`
    bundles cleanly (~1.52MB / 316KB gzip). Exercised with headless
    Chromium against mocked `GET /employers/me` responses covering all 4
    states plus a live form submission: confirmed the exact POST body
    sent, the success message, and that submitting with both fields
    blank is caught client-side before any network call. 5-viewport
    overflow audit on the rejected state (longest content on the page,
    including a long reviewer note) — zero horizontal overflow anywhere.
  - Pushed to the branch; **PR #16 opened** (not yet merged — user asked
    to open it, hasn't asked to merge yet).
- **CV import: switched off the Claude API to Cloudflare Workers AI** —
  the founder's response on seeing the Anthropic API is metered: "not
  willing to do that... can we use other tools instead?" Presented three
  real alternatives rather than picking one unilaterally — Cloudflare
  Workers AI (no new vendor, free daily allowance, needs a PDF-to-text
  step since its models don't read PDFs natively like Claude), Google
  Gemini's free tier (closest to the existing architecture, PDF-native,
  but a new vendor and a rate-limited trial allowance not a guarantee),
  or dropping the LLM entirely for regex parsing (free but genuinely
  poor quality on real CVs). The founder picked Workers AI.
  - **Researched the real API shape before writing anything** — same
    discipline as every schema check this session, just aimed at
    Cloudflare's docs instead of Supabase's: confirmed via
    `search_cloudflare_documentation` and the installed
    `@cloudflare/workers-types` definitions (not guessed) that (a)
    `env.AI.toMarkdown()` extracts PDF text natively — no separate PDF
    library needed — and that Cloudflare's own docs state image
    conversion (not plain text extraction) is the part that invokes
    billed models, so a text-based CV's extraction step is effectively
    free; (b) `env.AI.run()` accepts a `response_format: {type:
    "json_schema", json_schema}` parameter directly (OpenAI-compatible
    JSON mode), confirmed against the real
    `Ai_Cf_Meta_Llama_3_3_70B_Instruct_Fp8_Fast_Messages` type, not the
    OpenAI-SDK-wrapper examples the docs mostly show; (c)
    `@cf/meta/llama-3.3-70b-instruct-fp8-fast` is free-plan-eligible
    (some newer models like Kimi K2.7/GLM-5.2 now require Workers Paid —
    checked the current list before picking a model, since it had
    changed since training) and supports function calling / JSON mode.
  - **Rebuilt `POST /candidates/me/cv`** (`src/candidates.ts`): removed
    `@anthropic-ai/sdk` entirely (`npm uninstall`), removed the
    `nodejs_compat` compatibility flag (only ever needed for the
    Anthropic SDK's credential-chain module — confirmed nothing else in
    the codebase needs Node builtins before removing it), added
    `"ai": {"binding": "AI"}` to `wrangler.jsonc`. Two Workers AI calls
    now replace the single Claude call: `env.AI.toMarkdown()` (PDF →
    text, with `conversionOptions.pdf.images.convert: false` explicitly
    turned off — a deliberate, not default, choice: without it, an
    embedded CV photo would get run through an object-detection +
    image-to-text model and described in the output, which is exactly
    what non-negotiable #6 (data minimisation) forbids for photos; this
    is the same principle Sprint 5's design already applied to text
    fields, just extended to catch an image path the Claude version
    never had to think about since it never auto-converted embedded
    images at all) followed by `env.AI.run("@cf/meta/llama-3.3-70b-
    instruct-fp8-fast", {messages, response_format})` for the structured
    extraction itself.
  - **The one real trade-off, faced head-on rather than glossed over**:
    Claude's forced tool-use with `strict: true` guaranteed every
    returned profession/skill/qualification-type id was real, because
    the API itself enforced the schema's `enum`. Workers AI's JSON mode
    on an open-weight model doesn't come with that same guarantee. Built
    a new `sanitizeParsed()` function that replaces the guarantee
    explicitly and server-side: every id/regulator/category the model
    returns is checked against a `Set` of the real, freshly-fetched
    reference-table values (or the fixed regulator/sensitive-category
    lists) and dropped — not coerced, not guessed — if it doesn't match;
    malformed nested objects (wrong type, missing required sub-fields)
    are dropped per-entry rather than corrupting the whole parse; total
    garbage input degrades to a safe, fully-null/empty shape rather than
    throwing. This is arguably a stronger guarantee than before, since
    it's explicit, auditable code instead of trusting the model
    provider's schema-adherence claims.
  - **Verified without a live model call** (this sandbox still has no
    live Cloudflare auth, same limitation as before — `wrangler dev`
    requires real Cloudflare auth for Workers AI even locally, per
    Cloudflare's own docs: "Using Workers AI always accesses your
    Cloudflare account... even in local development"): `tsc --noEmit`
    clean, `wrangler deploy --dry-run` bundles cleanly (1521KB → 1099KB
    after dropping the Anthropic SDK, no `nodejs_compat` warning after
    removing the flag), and — since `sanitizeParsed()` is pure logic
    with no I/O — reimplemented it standalone in plain Node and ran it
    against 10 adversarial inputs (hallucinated profession/skill ids
    mixed with real ones, an invalid qualification `type_id` on an
    otherwise-valid entry, a qualification missing its required title,
    an invalid registration regulator, a valid registration, an
    employment entry missing `job_title`, invalid sensitive-category
    values mixed with real ones, a nonsense `overall_confidence` string,
    a fully empty object, and non-array/non-object garbage for every
    array field) — all 10 passed, confirming the safety net holds
    regardless of what a real model call would actually return. The
    existing frontend Playwright test (`cv-import-check.js`, unchanged
    since the frontend contract — the `parsed` JSON's field names —
    didn't change) was re-run and still passes end-to-end.
  - Committed and pushed to the branch. Not yet its own PR — will fold
    into whichever PR comes next unless asked to ship separately.

## Not started yet
- Employer-side API (profile, verification-request flow, browsing/
  shortlisting published candidates) — deliberately deferred in favor of
  candidate API first. Any employer search view must exclude photo/name/
  video/CV per non-negotiable #4 above.
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
