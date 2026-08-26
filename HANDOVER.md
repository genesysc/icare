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
- **Workers AI** (`env.AI` binding, `wrangler.jsonc`'s `ai` block) for
  CV parsing (Sprint 5 review pass) — deliberately not the Claude/
  Anthropic API, which was tried first and dropped over its per-call
  cost (founder decision, 2026-08-26). Default to Workers AI for any
  future LLM feature (e.g. Sprint 8's chat search) unless the user says
  otherwise.
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
| `src/index.ts` | Route mounting, `GET /`, `/health`, `/db-check`, `/professions`, `/skills`, `/qualification-types`, `/prompts`, `/media-check` |
| `src/auth.ts` | `POST /auth/request-code`, `POST /auth/verify-code`, `POST /auth/logout`, `GET /auth/me` |
| `src/middleware.ts` | `requireAuth` — verifies bearer token, attaches an RLS-scoped Supabase client + user id/object to context |
| `src/candidates.ts` | Candidate profile CRUD, photo upload/download, publish, professions/skills, employment history, qualifications (+ evidence upload), registrations, DBS (singleton upsert), references, self-expression prompts, badges (read-only), close-account, onboarding advance/complete, CV import (upload → Workers AI parse → review/apply) |
| `src/employers.ts` | Employer verification flow (Sprint 7): read own employer row + verification-request history, submit/re-submit for review |
| `src/waitlist.ts` | `POST /waitlist`, `GET /waitlist/count` |
| `src/email.ts` | `sendTransactionalEmail` — currently a deliberate no-op, see §8 |
| `src/emails/waitlist-welcome.ts` | The actual welcome email subject/HTML, unused until `email.ts` is wired up |
| `src/landing.html` | Candidate waitlist landing page — single file, inline CSS/JS, GSAP via CDN |
| `src/employers.html` | Employer waitlist landing page — separate design system, same self-contained pattern |
| `src/privacy.html` / `src/terms.html` | Draft legal pages (Sprint 0) — explicitly marked DRAFT, not lawyer-reviewed |
| `src/auth-client.js` | Shared client-side auth helper — reference file, not imported; copy into each signed-in page's own `<script>` tag |
| `src/sign-in.html` | Candidate sign-up/sign-in, mounted at both `/sign-up` and `/sign-in` |
| `src/employer-sign-in.html` | Employer sign-up/sign-in (Sprint 6), mounted at both `/employer/sign-up` and `/employer/sign-in`, own purple/teal design system |
| `src/verify.html` | OTP code entry, `/verify?email=...&role=...` — shared by both audiences, branches the post-verify redirect on the account's real role from `GET /auth/me` |
| `src/employer-home.html` | Employer stub home (Sprint 6), `/employer/home` — non-broken landing target until Sprint 7+ builds the real thing |
| `src/onboarding.html` | The full onboarding wizard (Sprint 2: basics/skills/availability; Sprint 3: employment history/qualifications/registrations; Sprint 4: DBS/references/prompts; Sprint 5: photo/review/publish) — 11 steps, spans Sprints 2–5, complete as of Sprint 5. Also accepts `?step=N` to jump to an already-completed step (used by the dashboard's "Edit" links) |
| `src/dashboard.html` | The real candidate dashboard (Sprint 5) — profile summary, badges (read-only), a per-section "at a glance" list with edit links back into the wizard, account closure |
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
- Candidate profile API (`src/candidates.ts`): profile CRUD (whitelisted
  fields), photo upload/download to R2, publish (via the existing
  `publish_my_profile()` RPC, gated by `can_publish()`),
  professions/skills (replace-whole-set), employment history/
  qualifications/registrations (full CRUD), DBS (singleton upsert),
  references (full CRUD), self-expression prompts (per-prompt
  upsert/delete), badges (read-only), close-account, plus onboarding
  advance/complete. Public reference routes: `/professions`, `/skills`,
  `/qualification-types`, `/prompts`.
- **Candidate onboarding wizard** (`src/onboarding.html`, Sprints 2–5):
  the full 11-step journey — basics, skills, availability, employment
  history, qualifications, registrations, DBS status/consent,
  references, self-expression prompts, photo, review & publish.
  Resumes from `onboarding_step` on load; accepts `?step=N` to jump to
  an earlier completed step (used for editing from the dashboard). On a
  genuine first visit, offers a choice screen first: upload a CV (see
  next bullet) or fill in the wizard manually.
- **CV import** (`POST/GET /candidates/me/cv*` in `src/candidates.ts`,
  the CV intro/upload/review screens in `src/onboarding.html`): upload a
  PDF → **Workers AI** (`env.AI`, no separate vendor/API key — runs on
  the same Cloudflare account, draws from its free daily Neuron
  allocation) extracts a draft → candidate reviews/edits/unchecks
  anything wrong on a dedicated screen → only then does "Apply" write
  anything, through the exact same routes manual entry uses. Two Workers
  AI calls: `env.AI.toMarkdown()` extracts text from the PDF (embedded-
  image conversion explicitly disabled, so a CV photo is never
  described/reasoned about — non-negotiable #6 applied to images too),
  then `env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", …)` with
  JSON-mode `response_format` extracts structured JSON from that text.
  **Originally built against the Claude API; switched to Workers AI
  after the founder declined the per-call cost** (2026-08-26) — see
  PROGRESS.md for the full before/after. The parse route itself never
  touches profile tables — enforces non-negotiable #5 architecturally,
  not just by prompting. Non-negotiable #6 (data minimisation) is
  enforced both in the system prompt and structurally (no field in the
  schema can carry DOB/nationality/immigration/marital/gender/religion/
  ethnicity/health/NI-number/photo data — flagged via
  `sensitive_categories_noticed` instead). **Real difference from the
  Claude version**: an open-weight model's JSON-mode isn't guaranteed to
  honor schema `enum` constraints the way Claude's forced tool-use was,
  so `sanitizeParsed()` in `src/candidates.ts` is now the actual
  guarantee — every profession/skill/qualification-type id and
  regulator the model returns is checked against the real reference
  tables and dropped if it doesn't match, regardless of what the model
  output. Verified in isolation against 10 adversarial inputs
  (hallucinated ids, malformed nested objects, non-array garbage,
  empty input) — see PROGRESS.md. No secret to provision — works as
  soon as it's deployed.
- **Candidate dashboard** (`src/dashboard.html`, Sprint 5): profile
  summary, badges (grouped by family, grade visually distinct per
  non-negotiable #2), a per-section "at a glance" list linking back
  into the wizard for edits, account closure.
- Sign-up/sign-in/verify (`src/sign-in.html`, `src/verify.html`, Sprint
  1): OTP-based, one entry point for both flows.
- **Employer sign-up/sign-in** (`src/employer-sign-in.html`,
  `src/employer-home.html`, Sprint 6): mirrors the candidate flow for
  `role: "employer"`, own purple/teal design system matching
  `employers.html`, collects an organisation name at signup. Lands on
  the new `/employer/home` stub post-verify — `handle_new_user()`
  already creates the `employers` row and an
  `employer_verification_requests` row automatically, so this needed no
  new backend routes.
- **Employer verification flow** (`src/employers.ts`, Sprint 7):
  `GET /employers/me` (own row + full verification-request history),
  `POST /employers/me/verification-requests` (submit/re-submit a CQC
  provider ID and/or Companies House number). `employers.is_verified`
  itself is the real gate (`is_verified_employer()` RPC) and can only be
  flipped by `service_role` — a DB trigger enforces this, so no client
  path can self-verify even by bug. `employer-home.html` now shows a
  real, data-driven verification card (4 states: none/pending/rejected/
  verified) instead of Sprint 6's static line. Review stays manual via
  the Supabase dashboard, same as qualifications/registrations.
- Landing pages: candidate-primary (`src/landing.html`) and employer
  (`src/employers.html`, v2, built against a real design/copy brief).
  Both waitlist-first pre-launch pages, not the real signed-in product.
- Waitlist: captures name/email/phone (+ `hiring_for` for employers),
  RLS-private, a real (not fabricated) live counter, honest "first 100"
  recognition-only messaging (explicitly not a paid-feature credit —
  see §1.1), on-page + email social share buttons.
- `/privacy`, `/terms` (Sprint 0): draft legal pages, explicitly marked
  DRAFT, not lawyer-reviewed.
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
   candidate side, which is now complete (Sprint 5). Any search view
   must exclude photo/video/CV pre-shortlist per non-negotiable #4 — note
   the dated override in §1: name/current job title/location are **not**
   excluded, per explicit founder instruction.
5. ~~CV import~~ — built during the post-Sprint-5 review pause (upload →
   Workers AI parse → candidate review/edit → apply), see §7. **No
   blocker** — runs on Workers AI (`env.AI`), the same Cloudflare
   account already in use, no separate secret to provision. (Originally
   built against the Claude API and blocked on `ANTHROPIC_API_KEY`;
   switched after the founder declined the cost — see PROGRESS.md.)
6. Candidate self-expression posts (with per-post, revocable, opt-in
   consent gating what's employer-visible) + employer conversational AI
   search (natural language, descriptive-not-evaluative, with a
   protected-characteristics guardrail that needs real design work, not
   just a prompt instruction) — explicitly phase 2 per the product brief.
7. ~~`/privacy` and `/terms` pages~~ — built (Sprint 0), explicitly
   marked DRAFT, not lawyer-reviewed.
8. ~~A real signed-in app UI (dashboard, profile editor)~~ — built: the
   full 11-step onboarding wizard (Sprints 2–5) and the real candidate
   dashboard (Sprint 5, `src/dashboard.html`). Candidate track complete.
9. ~~Employer-facing landing page~~ — built and merged (`GET /employers`,
   PR #11, deploy run #12); then rebuilt as v2 against the user's actual
   design/copy brief (much richer than v1 — see PROGRESS.md's "Done"
   section for detail and the fixes made against the draft). **That
   brief reveals the real employer product is chat-first AI search + a
   built-in ATS + an "iCompliance" module + AI interview parsing — not
   the simple structured-field search assumed elsewhere in this doc and
   in `SPRINTS.md`.** Treat `SPRINTS.md`'s employer track as stale until
   it's revised against this — it has been (see §13).

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
unscheduled) reflects all of this.

**⚠️ Correction, stale as of 2026-08-26**: this paragraph used to say
pre-shortlist search results "must stay fully anonymous." That's no
longer accurate — see §1 non-negotiable #4's dated annotation. The user
explicitly instructed candidate name, current job title, and location to
be shown pre-shortlist; only photo/video/CV stay gated. Don't rely on
this paragraph's history for current behavior — §1 is the source of
truth.

Sprint 0 is now shipped: `/privacy` + `/terms` pages (self-contained,
explicitly marked DRAFT, grounded in real system behavior including the
#4 override rather than idealised boilerplate) and the shared
`src/auth-client.js` reference helper. The Magic Link template fix is
confirmed still-manual (checked the actual Supabase MCP tool list, no
tool touches Auth email config). See PROGRESS.md's "Done" section.

Sprint 1 (candidate sign-up/sign-in UI) is also now shipped:
`src/sign-in.html` (one file, mounted at `/sign-up` and `/sign-in`),
`src/verify.html`, and two new stub pages (`src/onboarding.html`,
`src/dashboard.html`) as non-broken redirect targets until Sprints 2 and
5 build the real thing. All call the existing, unmodified `/auth/*` and
`/candidates/me` routes — no backend changes. A real bug was found and
fixed during testing: `history.replaceState` threw uncaught inside the
sign-up/sign-in mode toggle, silently aborting the rest of the page's
init script (so the toggle's click handlers never attached, no visible
error) — now wrapped in try/catch. See PROGRESS.md's "Done" section for
full detail, including what could and couldn't be tested (a live OTP
round-trip still isn't testable from this sandbox — confirmed again via
a direct `curl` to `*.supabase.co`, not just `wrangler dev` — same
pre-existing limitation, not new).

Sprint 2 (onboarding wizard shell + core profile) is also now shipped:
`src/onboarding.html` replaced the Sprint 1 stub with a real 3-step
wizard (basics, skills, availability), backed by two new routes in
`src/candidates.ts` (`onboarding/advance`, `onboarding/complete` — the
latter deliberately not called yet, since the wizard continues through
Sprints 3–5 and `onboarding_done` shouldn't flip true until all of it
exists). Since this sandbox can't reach Supabase, verification here went
beyond typecheck/bundle/audit: exercised the actual wizard JS with
headless Chromium and mocked API responses to confirm the step flow, a
conditional field, and resume-from-a-later-step all genuinely work, not
just look plausible. See PROGRESS.md's "Done" section for full detail.

All of the above (employer landing page v2, `SPRINTS.md`, the
non-negotiable #4 override annotation, and Sprints 0-2) shipped on
**PR #12**, which the user approved merging — `mergeable_state` confirmed
`clean`, squash-merged into `main`, deploy run #13
(https://github.com/genesysc/icare/actions/runs/32938882643) succeeded.
Live. Branch restarted from `main` per convention (§10).

Sprint 3 (work history, qualifications, registrations) is also now
shipped: the wizard grew from 3 real steps + a holding screen to 6 +
holding. Employment history reused the existing full-CRUD API outright
with a new add/edit/delete UI; qualifications and registrations got
brand-new CRUD routes in `src/candidates.ts` (plus an evidence-upload
route to R2 for qualifications) and a new public
`GET /qualification-types` reference route, all RLS-checked directly
against `pg_policies` first. One correction worth knowing: a new
qualification's `status` actually defaults to `none` in the real
schema, not `submitted` as `SPRINTS.md` originally assumed — it only
becomes `submitted` once evidence is genuinely uploaded (now corrected
in `SPRINTS.md`). Two real responsive-layout bugs were found and fixed
during testing (a step-label overflow at narrow widths, and a
record-card action/title overlap) — see PROGRESS.md's "Done" section
for full detail on both.

All of the above (Sprint 3) shipped on **PR #13**, which the user
approved merging — `mergeable_state` confirmed `clean`, squash-merged
into `main`, deploy run #14
(https://github.com/genesysc/icare/actions/runs/32941646689) succeeded.
Live. Branch restarted from `main` per convention (§10).

Sprint 4 (DBS status/consent, references, self-expression prompts) is
also now shipped: the wizard grew from 6 real steps + a holding screen
to 9 + holding. DBS is a true upsert (`dbs_records.candidate_id` is the
primary key, checked directly against the schema) with
`consent_given_at` stamped server-side only on the first `true` — never
client-supplied. References reuse the Sprint 3 record-card CRUD
pattern; the referee-response flow itself stays deferred, still blocked
on the parked domain/Sender.net work. Prompts are a new
`(candidate_id, prompt_id)` upsert/delete against the 6 real prompts
already seeded in the DB. All RLS-checked directly against
`pg_policies` first. The per-step label row (patched once already in
Sprint 3) was replaced outright with a single dynamic "Step X of 9 ·
Label" line, since it would have needed a third patch at 9 labels —
this removes that whole bug class instead of re-fixing it. See
PROGRESS.md's "Done" section for full detail. Not yet merged.

Sprint 5 (photo, review, publish, real candidate dashboard) is also now
shipped — **the candidate track is complete.** Read
`publish_my_profile()`'s and `can_publish()`'s actual SQL before
building against them, which surfaced two things neither `SPRINTS.md`
nor this doc previously knew: publishing itself sets `onboarding_done =
true` (the dedicated `onboarding/complete` route from Sprint 2 stays
permanently unused by design — publish *is* the completion signal), and
publishing is gated on 4 specific conditions (profession, employment
history, postcode, right-to-work ≠ `not_stated`), returning `published:
false` rather than an error if unmet. The review step mirrors those
exact conditions for an honest "still needed" checklist and computes
completeness using the DB's own 8-factor weights, read first not
guessed. A new `GET /candidates/me/photo` route had to be added — there
was no way to get an uploaded photo's bytes back before this. The new
dashboard (`src/dashboard.html`) is view-only for individual fields by
design — "Edit" links reuse the wizard via a new `?step=N` override
rather than duplicating every form a second time. Badges render with a
genuinely distinct visual treatment per grade per non-negotiable #2.
Account closure wraps the existing `close_my_account()` RPC behind a
two-step in-page confirm. See PROGRESS.md's "Done" section for full
detail.

All of the above (Sprint 5) shipped on **PR #14**, which the user
approved merging — `mergeable_state` confirmed `clean`, squash-merged
into `main`, deploy run #15
(https://github.com/genesysc/icare/actions/runs/32966651915) succeeded.
Live. Branch restarted from `main` per convention (§10). **The
candidate track is complete end to end, in production**: sign up →
verify → 11-step wizard → publish → real dashboard.

The user then paused sprint work to review the full candidate journey's
UI and copy — see PROGRESS.md's "Candidate-side UI/copy review pass" and
"CV import" entries for full detail. Three things came out of that
review: the professions picker was rebuilt as a grouped dropdown +
removable chips (data was already broad — 28 professions, 6 families —
the checkbox grid was just presenting it narrowly); the DBS step gained
a live preview line stating the exact non-negotiable #3 phrase as the
candidate fills it in; and CV import — a feature requested at the very
start of onboarding planning — was built: PDF upload → an LLM extracts
a draft → a fully editable review screen → apply, with non-negotiables
#5 and #6 enforced architecturally (the parse route never writes to
profile tables; the extraction schema has no field that could carry
sensitive personal data). All three fixes verified with headless
Chromium + a 5-viewport overflow audit; not yet pushed as a PR (folding
into the next sprint's PR unless asked to ship separately).

**⚠️ Switched off the Claude API, 2026-08-26 — founder declined the
per-call cost.** CV import was originally built against the Claude API
(`claude-opus-5`, forced tool use). When told this wasn't free, the
founder asked for a genuinely free alternative rather than a cheaper
metered one, and picked **Cloudflare Workers AI** from three options
presented (the others: Google Gemini's free tier, or no LLM at all).
Rebuilt against `env.AI` — no separate vendor/API key, runs on the
Cloudflare account already in use, draws from its free daily Neuron
allocation (10,000/day). Two calls replace the single Claude call:
`env.AI.toMarkdown()` extracts text from the PDF (with embedded-image
conversion explicitly turned off, so a CV photo is never described —
non-negotiable #6 applied to images too), then
`env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", …)` with
JSON-mode extracts the structured draft from that text. **The one real
trade-off**: Claude's forced tool-use with a strict schema guaranteed
every returned id was real; an open-weight model's JSON mode doesn't
give that guarantee, so a new `sanitizeParsed()` function in
`src/candidates.ts` now does it explicitly — every id/regulator the
model returns is checked against the live reference tables and dropped
if invalid. Verified against 10 adversarial inputs in isolation
(hallucinated ids, malformed nested objects, garbage types, empty
input) — all pass. No secret to provision; works as soon as it's
deployed. See PROGRESS.md's "Done" section for full detail.

Sprint 6 (employer sign-up/sign-in UI) is now shipped — **the employer
track has started.** `src/employer-sign-in.html` (own purple/teal design
system, mirrors the candidate sign-in pattern, collects an organisation
name at signup) and a new `src/employer-home.html` stub (the employer
equivalent of Sprint 1's onboarding/dashboard stubs) round out the flow;
`src/verify.html` is now shared by both audiences, branching the
post-verify redirect on the account's real role from the existing
`GET /auth/me` rather than duplicating the whole verification page.
Reading `handle_new_user()`'s real SQL first (not assumed) showed it
already creates both the `employers` row and an
`employer_verification_requests` row automatically on employer
signup — so this sprint needed zero new backend routes, and Sprint 7's
job is reviewing/completing that request, not creating it. The
`/employers` marketing page itself is untouched, same as the candidate
landing page was left unlinked to `/sign-in` after Sprint 1 — pre-launch
marketing and the real signed-in product stay separate for now. See
PROGRESS.md's "Done" section for full detail, including how redirects
were verified given `file://`'s navigation limitation in this sandbox.
Not yet pushed as a PR.

All of the above (professions/DBS fixes, CV import, Sprint 6) shipped
on **PR #15**, which the user asked to be opened and merged —
`mergeable_state` confirmed `clean`, squash-merged into `main`, deploy
run #16 (https://github.com/genesysc/icare/actions/runs/33000995853)
confirmed `success`. Live. Branch restarted from `main` per convention.

Sprint 7 (employer verification flow) is now shipped. New
`src/employers.ts` (`GET /employers/me`, `POST /employers/me/
verification-requests`) and a real verification card in
`employer-home.html` replacing Sprint 6's static line — four states
(no identifier yet / submitted-under-review / rejected with reviewer
note / verified), matching the real `evidence_status` enum lifecycle.
Reading `lock_employer_verification()`'s real SQL first confirmed
`employers.is_verified` can only ever be flipped by `service_role` — no
client code path, even a bug in this route, can self-verify an
employer. `employer_verification_requests` is append-only by RLS (no
UPDATE policy), so each (re)submission is a new audit row rather than
an edit — the route's design follows that directly rather than fighting
it. See PROGRESS.md's "Done" section for full detail, including a
`PATCH /employers/me` route that was drafted then deliberately removed
before committing since nothing used it.

All of the above (Sprint 7 + the CV-import Workers AI switch) shipped
on **PR #16**, which the user asked to be merged — `mergeable_state`
confirmed `clean`, squash-merged into `main`, deploy run #17
(https://github.com/genesysc/icare/actions/runs/33004189020) confirmed
`success`. Live. Branch restarted from `main` per convention.

**CQC verification is currently fully manual, by design** — asked
about directly and worth being explicit here: `POST /employers/me/
verification-requests` only ever creates a `submitted` audit row, it
never checks the CQC provider ID against anything. `employers.
is_verified` stays `false` until someone with database access checks
the CQC register themselves and flips it via `service_role` (no admin
UI exists for this yet — a raw Supabase dashboard edit). CQC is
believed to publish a public "Syndication API" for looking up a
provider's registration status, but this has **not been verified**
in any session (no live web access to confirm the current endpoint/
terms) — do not build against it from training-knowledge recall alone;
research it properly first if/when the founder asks for automated
verification.

**Next priorities**: Sprint 8 (chat infrastructure + candidate search —
the foundation the rest of the employer track sits on). **Default to
Workers AI for this too, not the Claude API** — the founder's cost
objection above is a standing preference, not a one-off for CV import;
check with the user before reaching for a metered third-party LLM API
anywhere else in this build. Don't restart the domain/Sender.net work
unless the user brings it back up.

As always: check current branch/PR state before assuming anything in
this doc is deployed to `main`.
