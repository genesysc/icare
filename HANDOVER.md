# iCare — engineering handover (Cloudflare Workers build)

The user is switching agents (out of credits on this one). This document
is the curated entry point for whoever picks this up next — read it
first, in full, before writing any code. **`PROGRESS.md` is the detailed
chronological session log** (every decision, every PR, every dead end) —
consult it for history or specifics this doc doesn't cover, but this file
is where you start.

The product's internal codename is **care·register**; the user-facing
brand is **iCare**. It's a UK health and social care recruitment
marketplace: candidates (carers, nurses, healthcare professionals) build a
profile, verified employers search and shortlist. Currently pre-launch —
live surface is a waitlist landing page, not the product itself.

---

## 1. Non-negotiables — read before touching auth, badges, DBS, search, or pricing

These come from a separate `HANDOVER.md` for an earlier (parallel, not
currently deployed) Next.js build of the same product, which the user
shared partway through this session. They are compliance-driven, not
ordinary product preferences. **If a task seems to require breaking one,
stop and ask the user — do not resolve it yourself.**

1. **Candidates are never charged, for anything.** Employment Agencies Act
   1973 s6(1) (no fee for finding work, directly or indirectly) + 2003
   Conduct Regulations reg. 5 (can't condition work-finding on buying
   other services) + DHSC Code of Practice (stricter for international
   health/social care recruitment specifically). No premium profile, no
   featured listing, **no profile boost, ever, in any framing** — this
   already tripped up an earlier draft of the waitlist copy ("50 bonus
   credit for paid features") and was explicitly rejected once this rule
   surfaced. If a future request implies a candidate payment path,
   surface the conflict before building it.
2. **Badge grades are earned, never bought, never mis-graded.** Four
   fixed grades on `badges.grade` (confirmed against the real DB enum):
   `verified` (checked against a public register/identity provider,
   system-awarded), `evidenced` (document uploaded, human-reviewed),
   `derived` (computed from platform data), `declared` (candidate said
   so, unchecked). UI must keep these visually distinct. No client write
   path to `candidate_badges` should ever exist (RLS: read-only to
   clients).
3. **Never claim a DBS is "verified."** Only the employer can verify a
   DBS, via the DBS Update Service. Correct wording: *"Enhanced DBS · on
   Update Service."* Forbidden: "DBS Certified/Verified/Checked." The
   certificate number (`dbs_records`) is never shown on the open profile
   — only released after shortlist + candidate consent.
4. **Written shortlisting before anything visual.** Equality Act 2010
   exposure. Any future employer-facing search view must exclude photo,
   name, video, and CV file — those unlock only after shortlist +
   consent. Not built on this side yet (no employer search exists), but
   binding on whatever gets built.
   **⚠️ Partially overridden 2026-08-26, founder instruction:** search
   results now show name, current job title, and location up front —
   "i command you to not let it interfere with planning for now... When
   the employer searches the AI should generate the names, current job
   title and location of the candidate." Photo, video, and CV file are
   **still excluded** pre-shortlist — the override is scoped to name/
   title/location only, nothing else here changed. See `SPRINTS.md`
   Sprint 8 for where this is implemented. The reasoning above (a name
   signals gender/ethnicity — indirect-discrimination exposure) still
   stands as the rationale the rule existed for; this is a deliberate,
   informed departure from it, not a correction to the reasoning.
5. **AI never scores, ranks, or filters a candidate.** AI may summarise,
   extract, transcribe, draft — a human decides. A future CV parser must
   propose a draft the candidate confirms; never auto-apply a parse.
   Sharpened further by product-direction notes (see §9): an employer
   conversational AI search is planned, but must be *descriptive, not
   evaluative* (no "fit score"), and must **hard-exclude protected
   characteristics** (Equality Act 2010) from query handling — even if an
   employer phrases a query that way. Not designed or built yet; the
   guardrail needs a real validation layer, not just a prompt
   instruction.
6. **Data minimisation on anything ingested.** A future CV parser must
   not extract DOB, nationality, immigration detail, marital status,
   gender, religion, ethnicity, health info, NI numbers, or photos — flag
   them instead (there's already a `cv_imports.sensitive_found` column
   for this). Postcodes on profile are outward-district only (`EN1`);
   full postcode lives in `candidate_contact`, gated behind shortlist +
   consent. (Already respected: `PATCH /candidates/me`'s whitelist only
   exposes `postcode_district`.)
7. **Regulation 22 (vulnerable persons).** Before a placement: confirm
   identity, qualifications, and **two references**, give the hirer
   copies. No placement feature exists yet on this build — don't let one
   ship without this.
8. **Immigration facts constraining copy/filters.** Overseas recruitment
   for *care worker* and *senior care worker* roles closed 22 July 2025;
   in-country switching runs to 22 July 2028. Don't build copy/filters
   implying overseas sponsorship for those two roles specifically. Other
   healthcare roles are unaffected.

---

## 2. Stack

- **Cloudflare Workers**, TypeScript, [Hono](https://hono.dev/) as the
  router — this is the entire backend + landing page host, one Worker.
- **Supabase** — Postgres + Auth. Same database as the (currently
  dormant) Next.js build referenced in §1.
- **No frontend framework.** The landing page is a single static HTML
  file, text-imported into the Worker at build time and served via
  `c.html()`. No build step beyond `wrangler deploy`.
- **GitHub Actions** for CI/CD (deploy on push to `main`).
- Email (transactional/waitlist) is planned via **Sender.net**, not yet
  active — see §8.

---

## 3. Accounts / access

- **Cloudflare account**: "iCare" (`181e44a6963cb30381a30edbd56a4b46`).
  The OAuth connection in this environment can see a second, unrelated
  Cloudflare account too — **always pass `account_id` explicitly** to
  Developer Platform tools (works even when the tool's declared schema
  doesn't show the param — pass it anyway).
- **Supabase project**: `care-register` (id `blflbiwqflidltqflwew`), org
  "Genesys Consultancy" (`eurukfztpdvalqtjpusu`), region `eu-west-2`.
  **This is iCare's real backend** despite the project's name. Two other
  unrelated projects exist in the same org (`Meridian Project`,
  `rah-caregiver-portal`) — **do not touch those**. The org is at its
  2-project free-tier active-project cap already; don't create new
  Supabase projects without checking with the user first.
- **Sender.net account**: "Genesys Consultancy Ltd" (id `egLgor`, free
  plan). Only `genesysconsultancy.co.uk` is a verified sending domain —
  the user wants a dedicated `icare` domain before any email actually
  sends (see §8).
- **GitHub**: `genesysc/icare`. Dev branch:
  `claude/cloudflare-icare-setup-qt575f`. Workflow so far: one PR per
  logical change, merged via squash; after each merge, the branch gets
  reset from `origin/main` before starting the next change (see §7 for
  why this matters).

---

## 4. File map (this repo)

| File | What |
|---|---|
| `wrangler.jsonc` | Worker config — account id, vars (Supabase URL/key), R2 binding, the `Text` import rule for `.html` |
| `src/index.ts` | Route mounting, `GET /`, `/health`, `/db-check`, `/professions`, `/skills`, `/media-check` |
| `src/auth.ts` | `POST /auth/request-code`, `POST /auth/verify-code`, `POST /auth/logout`, `GET /auth/me` |
| `src/middleware.ts` | `requireAuth` — verifies bearer token, attaches an RLS-scoped Supabase client + user id/object to context |
| `src/candidates.ts` | Candidate profile CRUD, photo upload, publish, professions/skills, employment history |
| `src/waitlist.ts` | `POST /waitlist`, `GET /waitlist/count` |
| `src/email.ts` | `sendTransactionalEmail` — currently a deliberate no-op, see §8 |
| `src/emails/waitlist-welcome.ts` | The actual welcome email subject/HTML, unused until `email.ts` is wired up |
| `src/landing.html` | The waitlist landing page — single file, inline CSS/JS, GSAP via CDN |
| `src/html.d.ts` | Ambient module declaration so `tsc` accepts importing `.html` as a string |
| `.github/workflows/deploy.yml` | CI: typecheck, `wrangler deploy` on push to `main` |
| `PROGRESS.md` | Full session log — read for history/detail this doc doesn't cover |
| `SPRINTS.md` | Forward-looking roadmap — candidate journey sprints, then employer journey sprints. Check here before picking "what's next" |
| `AGENTS.md` / `CLAUDE.md` | Pointer files: read `PROGRESS.md` (and now this file) first, update before ending a session |

No `supabase/migrations/*.sql` files exist in this repo — all Postgres
migrations were applied directly to the live Supabase project via MCP
tooling (`apply_migration`), not committed as files here. Migration
history so far: `0001_init` through `0006_function_privileges` (from the
original Next.js build, already in place when this build started),
`0007_waitlist`, `0008_waitlist_details` (added by this build). **Worth
deciding** whether to start mirroring these as files in this repo for
version control — not yet done.

---

## 5. Data model

Full schema detail is in `PROGRESS.md`; summary here. The database
already has 23+ tables from the original build: `accounts` (role,
status) → `candidates` or `employers`, with satellites
(`candidate_professions`, `employment_history`, `qualifications`,
`registrations`, `dbs_records`, `candidate_skills`, `candidate_prompts`,
`candidate_references`, `candidate_badges`, `cv_imports`), restricted
tables gated by shortlist+consent (`candidate_contact`, full DBS cert
number, the CV file itself), and reference data (`professions`,
`clinical_skills`, `qualification_types`, `prompts`, `badges`). RLS is
enabled everywhere; the pattern throughout is `*_self` policies (a user
can read/write only their own rows) plus narrow published/verified-gated
read policies for the employer side.

This build added: **`waitlist`** (`email` unique, `full_name`, `phone`,
`created_at`) — RLS allows anyone to insert, nobody to read the raw
table; a `SECURITY DEFINER waitlist_count()` RPC exposes just the
aggregate count.

Useful existing RPCs: `current_role_is(role)`, `is_verified_employer()`,
`close_my_account(reason)`, `publish_my_profile()`.

---

## 6. Auth

**Email OTP, no passwords.** This was a deliberate switch mid-session —
this build originally used password auth, then was changed to match the
original spec once its rationale surfaced (candidates return every few
months; a forgotten password is a lost candidate; magic links were
rejected because opening one in a mobile mail app loses the session in a
different browser).

- `POST /auth/request-code` — `{ email, create?, role?, full_name?, org_name?, terms_version? }`.
  One entry point for both sign-up and sign-in; `create` (default `true`,
  maps to Supabase's `shouldCreateUser`) is the only difference — pass
  `create: false` on a sign-in screen so an unrecognised email doesn't
  silently create an account. `role` (`candidate`|`employer`) is required
  when `create` is true.
- `POST /auth/verify-code` — `{ email, token }` (the 6-digit code) →
  `{ user, session }`.
- `POST /auth/logout`, `GET /auth/me` — both need
  `Authorization: Bearer <access_token>`.

**⚠️ Not yet verified end-to-end.** Supabase's default "Magic Link" email
template needs to be changed to reference `{{ .Token }}` (Dashboard →
Authentication → Emails → Templates), or `verifyOtp` rejects every valid
code. This is a manual Dashboard step, not covered by any MCP/API tool
available in this session, and **has not been done**. Until it is, the
OTP flow is deployed but unconfirmed against a real inbox.

The `handle_new_user()` trigger (already in the DB, not something to
rebuild) reads `raw_user_meta_data.signup_role`/`full_name`/`org_name`/
`terms_version` on `auth.users` insert, creates the matching `accounts`
row plus `candidates`+`candidate_contact` or `employers`+
`employer_verification_requests`, and mirrors `role` into
`raw_app_meta_data` so it's in the JWT.

---

## 7. What is built

- Cloudflare account, Worker (`icare`), CI/CD, `workers.dev` subdomain
  registered, R2 bucket (`icare`, bound as `MEDIA`).
- Supabase wired in as the real backend (D1 was removed — it was a
  placeholder from before the real backend was identified).
- Auth: OTP request/verify, logout, me.
- Candidate profile API: profile CRUD (whitelisted fields), photo upload
  to R2, publish (via the existing RPC), professions/skills
  (replace-whole-set), employment history (full CRUD), public
  professions/skills reference lists.
- Landing page v2: waitlist-first, candidate-primary (employer messaging
  is supporting context only — no employer CTA on this page). Built
  against an actual copy/design brief and mockup the user provided
  mid-session (superseded a v1 draft that guessed wrong). Serif display
  type (Fraunces) + monospace labels (IBM Plex Mono) + teal/plum palette.
  Restrained scroll/entrance motion (`epic-design` skill), full
  `prefers-reduced-motion` + coarse-pointer fallbacks.
- Waitlist: captures name/email/phone, RLS-private, a real (not
  fabricated) live counter, honest "first 100" recognition-only messaging
  (explicitly not a paid-feature credit — see §1.1), on-page + email
  social share buttons (X/LinkedIn/Facebook/WhatsApp, plain share-intent
  URLs, no library).
- Welcome email: fully written (`src/emails/waitlist-welcome.ts`), not
  yet sending — see §8.

All of the above is deployed and CI-confirmed working, **except** the
most recent commits on the open PR (see §10) which haven't had a fresh
deploy confirmation yet.

## 8. What is not built

**Blocking real usage**

1. **Custom `icare` domain** — blocks three things: (a) Supabase Auth
   custom SMTP via Sender.net for auth emails, (b) the waitlist welcome
   email (`src/email.ts`'s `sendTransactionalEmail` is a documented
   no-op until this exists), (c) cosmetic only, Cloudflare is fine on
   `workers.dev` for now. This is the single highest-leverage unblock.
2. **Supabase email template fix** (`{{ .Token }}`) — see §6. Manual
   Dashboard step.
3. **Sender.net API integration itself** — `src/email.ts` has a stub with
   clear activation instructions in a comment, but the actual
   transactional-send request was never written (blocked on #1 anyway).
   Check current Sender.net API docs for the exact endpoint/payload
   shape when this is picked up — don't guess at it.

**Next, no particular blocker**

4. Employer-side API (profile, verification-request flow, browsing/
   shortlisting published candidates) — deliberately deferred behind the
   candidate side. Any search view must exclude photo/name/video/CV per
   non-negotiable #4.
5. Candidate qualifications, DBS records, references, badges, prompts, CV
   import — schema and RLS already exist, no Worker routes yet. DBS/badge
   *copy* must follow non-negotiables #2–#3 when built.
6. Onboarding wizard + candidate home page — a parallel Next.js build
   (not deployed, referenced mid-session) already has these; the decision
   was to **port the logic/business rules to Cloudflare Workers, not
   reuse the Next.js code directly** (different framework — no server
   components/actions here). Treat those files as a spec, if the user
   still has them, not as code to merge in.
7. Candidate self-expression posts (with per-post, revocable, opt-in
   consent gating what's employer-visible) + employer conversational AI
   search (natural language, descriptive-not-evaluative, with a
   protected-characteristics guardrail that needs real design work, not
   just a prompt instruction) — explicitly phase 2 per the product brief.
8. `/privacy` and `/terms` pages — will be needed before any real signup
   flow (not just waitlist) ships.
9. A real signed-in app UI (dashboard, profile editor) — nothing exists
   yet for a user to land on after authenticating via `/auth/*`.
10. ~~Employer-facing landing page~~ — built and merged (`GET /employers`,
    PR #11, deploy run #12); then rebuilt as v2 against the user's actual
    design/copy brief (much richer than v1 — see PROGRESS.md's "Done"
    section for detail and the fixes made against the draft). **That
    brief reveals the real employer product is chat-first AI search + a
    built-in ATS + an "iCompliance" module + AI interview parsing — not
    the simple structured-field search assumed elsewhere in this doc and
    in `SPRINTS.md`.** Treat `SPRINTS.md`'s employer track as stale until
    it's revised against this.

---

## 9. Product-direction notes (from a copy/design brief, treat as roadmap)

Phase 2, not built, but shapes what "not evaluative AI" and "consent
gating" need to look like when they are: candidates will be able to post
freely (not just structured fields), with **per-post, revocable consent**
controlling whether a post is private, visible to other candidates, or
included in the employer-facing AI search pool — default most
restrictive, inclusion always opt-in. Employers get a natural-language
search interface over that consented content; see non-negotiable #5 for
the hard constraints this must respect.

---

## 10. Conventions specific to this repo

- **Branch workflow**: after each PR merges (squash), reset the dev
  branch from `origin/main` before the next change
  (`git fetch origin main && git checkout -B <branch> origin/main`) —
  the squash-merged commit has a different SHA than what's local, so
  reusing the old branch tip causes divergence.
- **Every code change**: `npm run typecheck` (must pass) and
  `npx wrangler deploy --dry-run --outdir=<tmp>` (validates bundling,
  catches things `tsc` alone won't — e.g. the `.html` text-import rule)
  before pushing.
- **`wrangler.jsonc` quirks worth knowing**: `wranglerVersion: "4"` is
  pinned in `deploy.yml`'s `cloudflare/wrangler-action` step because it
  defaults to Wrangler 3.x, which conflicts with
  `@cloudflare/workers-types@^5`; the runner needs Node 22 (Wrangler 4
  requires it). Both already fixed, just explaining why they're there so
  nobody "simplifies" them back.
- **`requireAuth` middleware** (`src/middleware.ts`) is the pattern for
  any new authenticated route — attaches an RLS-scoped Supabase client
  (forwards the caller's own bearer token, never `service_role`) plus
  `userId`/`user` to Hono context. Reuse it; don't hand-roll token
  parsing again.
- **`PROGRESS.md` discipline** (enforced via `AGENTS.md`/`CLAUDE.md`):
  read it first, update it before ending a session. This handover doc
  doesn't replace that habit — keep both current.

---

## 11. Gotchas

- Cloudflare account-scoped tool calls need `account_id` passed
  explicitly even when a tool's declared schema doesn't show the
  parameter — pass it anyway, it works.
- `workers.dev` subdomain registration is a one-time manual Dashboard
  step (Workers & Pages → set up your subdomain), no API path exists.
- Supabase's free tier caps a org at 2 *active* projects — this org is
  already at that cap with `Meridian Project` and `care-register` (the
  third, `rah-caregiver-portal`, is paused).
- `claude.ai/share/*` links are **not reachable** from this sandbox
  (network egress policy resets the connection even through the
  configured proxy) — only `claude.ai/code/artifact/*` URLs are
  fetchable. If a shared conversation link needs reading, ask the user to
  export/paste it or upload the file directly.
- The Cloudflare Developer Platform MCP connector in this environment can
  see a second, unrelated Cloudflare account — always double check
  `account_id` before creating/deleting resources.

---

## 12. Open questions for the founder

- **`icare` domain** — not yet purchased/chosen. Blocks §8 item 1.
- **Sender.net vs an alternative** for transactional email — decided in
  principle (Sender.net, as SMTP relay behind Supabase Auth for auth
  emails; direct API for the waitlist welcome email), not yet executed.
- **Whether to mirror Supabase migrations as files in this repo** — right
  now the only record of schema history is Supabase's own migration
  list, not version-controlled alongside the app code.
- Carried over from the original Next.js build's handover, still
  unresolved: Northern Ireland agency licensing (entity not yet
  incorporated), retention period on closed accounts (`purge_after`
  currently defaults to 12 months, needs legal confirmation), two-factor
  auth for employers (deferred until there are real shortlists), what
  "verified employer" actually requires (CQC provider ID match is
  strong, Companies House number weaker, email domain match weak —
  currently would be a manual judgement call, no employer verification
  flow exists yet to make it in).

---

## 13. Immediate next step (updated 2026-08-25, post-hand-off)

**Done since this doc was written**: PR #9 merged and deployed. The
UI-fluidity check this section used to flag is also done — actually
rendered the landing page at 6 real viewport sizes via headless Chromium
(not just read the CSS) and fixed two real problems: the hero's
absolutely-positioned card stack (previously the most layout-fragile part
of the page, flagged here) is now one naturally-flowing card with no
per-breakpoint overrides, and the feature grid now uses the available
width on larger screens instead of always single-column. No horizontal
overflow at any tested size, before or after. The user then supplied a
real photo for that hero card's illustrative profile; it's cropped to a
52px circular avatar, embedded as a base64 data URI (still a single
self-contained landing.html, no new asset route), and the card's
name/role text was updated to match the badge visible in the photo
("Emily R." / "Healthcare Assistant · Belfast"). Both changes shipped on
PR #10, which the user approved merging — squash-merged to `main`, deploy
run #11 succeeded. Both are live.

The user then explicitly parked the custom-domain/Sender.net work ("will
buy the domain in a few days time so let's park this for now") and asked
for the employer-facing landing page instead (§8 item 10). That's now
built — `GET /employers`, same design system as the candidate page,
separate employer waitlist pool (migration `0009_waitlist_employer_role`).
See PROGRESS.md's "Done" section for full detail. Shipped on PR #11,
which the user approved merging — squash-merged to `main`, deploy run
#12 succeeded. Live.

The user asked to move from waitlist-only to the actual platform,
candidate journey first then employer, and `SPRINTS.md` was written for
that. **Before Sprint 0 started**, the user uploaded a real design +
copy brief for a v2 employer landing page — built, see PROGRESS.md's
"Done" section for the fixes made against the draft (a fake-stats
counter, an evaluative-language slip against the brief's own compliance
note, a missing-id nav bug, an unvetted hotlinked photo, feature-list
drift between the two uploaded files). More importantly, that brief
reveals the real employer product is chat-first AI search + a built-in
ATS + an "iCompliance" module + AI-parsed video interviews —**not** the
simple structured-field search `SPRINTS.md`'s employer track (Sprints
6–10) was written against.

That revision pass happened next — the user chose, explicitly: **chat is
the primary employer interface from day one** (not a fast-follow layer),
**pipeline stages are fixed** (Shortlisted/Interview/Offer/Hired) not
per-employer configurable, **AI-parsed video interviews are a separate,
later initiative** (not in this track), and **iCompliance is real and
scoped** (an employer's own compliance checklist/workflow per hire) **but
explicitly not urgent** — captured as Sprint 12, don't start it
unprompted. `SPRINTS.md`'s employer track (now Sprints 6–11, plus 12
unscheduled) reflects all of this. One catch worth restating here since
it's easy to miss: the brief's own mockups show partial candidate names
("Aoife M.") in pre-shortlist results, which violates non-negotiable #4
— a first name signals gender/ethnicity, exactly the exposure that rule
prevents. `SPRINTS.md` Sprint 8 states the real search/chat results must
stay fully anonymous (role/badges/location/experience only) pre-
shortlist; the landing page mockup is fine only because it's captioned
illustrative marketing.

**Next priorities**: `SPRINTS.md` is current — start at Sprint 0
(candidate track) or, since the employer scope conversation is what
prompted the pause, whichever the user wants next. Sprint 8 (chat
infrastructure) will need an `ANTHROPIC_API_KEY` secret added via
`wrangler secret put` when it starts — not yet provisioned. Don't
restart the domain/Sender.net work unless the user brings it back up.

As always: check current branch/PR state before assuming anything in
this doc is deployed to `main`.
