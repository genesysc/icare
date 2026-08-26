# iCare — Sprint Plan (candidate journey, then employer journey)

**Read `HANDOVER.md` first**, then this file. This is the forward-looking
roadmap — what ships in what order, and why that order. `HANDOVER.md`
stays the curated "current state" doc; `PROGRESS.md` stays the
chronological log of what actually happened. When a sprint ships, mark it
`✅ Shipped` here (with the PR number) and log the detail in `PROGRESS.md`
as usual — don't let this file drift from reality.

Scope and order below are grounded in what's actually already built: the
DB schema already has `candidates.onboarding_step` / `onboarding_done`
and an `onboarding_events` table, so a stepped wizard was clearly the
original design intent, not something invented here. Every sprint lists
which Worker routes/tables already exist vs. need building — check before
assuming something needs to be built from scratch.

**Every sprint is bound by `HANDOVER.md` §1's non-negotiables.** They're
referenced by number below (e.g. "non-negotiable #3") — re-read the
relevant one before starting a sprint that touches badges, DBS, search,
or pricing. If a sprint seems to require breaking one, stop and ask
before building.

---

## Sprint 0 — Foundations for a real (non-waitlist) product surface ✅ Shipped

Nothing below this works without these first.

- **`/privacy` and `/terms` pages** — ✅ built (`src/privacy.html`,
  `src/terms.html`), same self-contained pattern as the landing pages,
  linked from both pages' footers. **Marked DRAFT throughout** — grounded
  in what the product actually does (including the Sprint 8 search-result
  override) rather than generic boilerplate, but not lawyer-reviewed;
  placeholders (company registration details, contact email, retention
  period, governing law) are bracketed, not invented. Get real legal
  review before this governs an actual signup flow.
- **Fix the Supabase "Magic Link" email template** — ❌ still manual,
  confirmed no Supabase MCP tool exposes Auth email template config
  (checked the available tool list directly rather than assuming).
  Needs the user in the Dashboard. Doesn't need the parked domain.
- **UI approach decision** — confirmed by doing it: `/privacy` and
  `/terms` follow the same self-contained-HTML pattern as the landing
  pages, no new framework introduced.
- **A shared client-side auth helper** — ✅ built (`src/auth-client.js`).
  Not imported anywhere (no build step in this repo) — it's the
  canonical reference every signed-in page copies verbatim into its own
  `<script>` tag, same convention already used for the landing pages'
  duplicated JS. `icareGetSession`/`icareSetSession`/`icareClearSession`
  (localStorage), `icareAuthFetch` (attaches `Authorization: Bearer`),
  `icareRequireAuth` (redirects to sign-in with a `?next=` param if no
  valid session). Sprint 1 is the first consumer.

---

## Candidate track

### Sprint 1 — Candidate sign-up / sign-in UI ✅ Shipped

A real candidate can create an account and land somewhere.

- Sign-up + sign-in combined into one page (`src/sign-in.html`, mounted
  at both `/sign-up` and `/sign-in`) with a client-side mode toggle —
  posts to the **existing, unmodified** `POST /auth/request-code`
  (`create: true, role: "candidate"` for sign-up; `create: false` for
  sign-in). Sign-up requires a terms checkbox linking to `/terms`/
  `/privacy` (Sprint 0), sends `terms_version`.
- `src/verify.html` — 6-digit code entry, posts to the **existing,
  unmodified** `POST /auth/verify-code`, stores the session via the
  Sprint 0 auth helper (copied inline, per convention).
- On verify success: calls the **existing** `GET /candidates/me` to read
  `onboarding_done`, then redirects to `/onboarding` (false) or
  `/dashboard` (true). Both are new **stub** pages — the real wizard
  (Sprint 2) and dashboard (Sprint 5) don't exist yet, but Sprint 1 needs
  a non-broken redirect target either way. Both stubs reuse the same
  auth-guard JS (`icareRequireAuth`) that the real pages will keep.
- No DB or existing-route changes — `handle_new_user()` already creates
  the `candidates` row on signup, exactly as this sprint assumed.
- **Bug caught and fixed during testing**: `history.replaceState` in the
  mode-toggle threw uncaught in one tested context, which silently
  aborted the rest of the page's init script — meaning the toggle button
  never got its click handler at all, with no visible error. Wrapped in
  try/catch; the URL-bar update is best-effort, the mode toggle itself
  no longer depends on it succeeding.
- **Not testable from this environment**: a live OTP round-trip (send
  code → real inbox → verify) — this sandbox has no email inbox access,
  and confirmed (again) it can't reach `*.supabase.co` at all, by
  `curl`, not just via `wrangler dev`. Same pre-existing limitation
  `HANDOVER.md` §6 already flagged, not new to this sprint. What *is*
  verified: `tsc --noEmit` clean, `wrangler deploy --dry-run` bundles
  cleanly, 6-viewport headless-Chromium audit on all 4 new pages (zero
  overflow), and the sign-up/sign-in mode toggle visually confirmed
  correct after the fix above.

### Sprint 2 — Onboarding wizard shell + core profile ✅ Shipped

The wizard framework itself, plus the first real steps. Replaces the
Sprint 1 stub `src/onboarding.html` outright.

- **New routes** (`src/candidates.ts`): `POST /candidates/me/onboarding/
  advance` (`{ step, event }` — bumps `candidates.onboarding_step` to
  `max(current, step)`, always inserts a row into `onboarding_events`),
  `POST /candidates/me/onboarding/complete` (sets `onboarding_done =
  true`, logs a `completed` event). **Not called by this sprint's UI**
  — `complete` is Sprint 5's job, once the whole wizard (Sprints 2–5)
  actually finishes; calling it early would be dishonest about what
  `onboarding_done` means. RLS confirmed compatible before writing the
  routes (`candidate_self` on `candidates`, `onboarding_events_self` —
  INSERT only, `candidate_id = auth.uid()` — on `onboarding_events`).
- Wizard UI shell (`src/onboarding.html`): 3 client-side steps in one
  page (progress dots + labels, back/next), resumes from
  `candidates.onboarding_step` on load rather than restarting — fetches
  `GET /candidates/me` + `/candidates/me/professions` +
  `/candidates/me/skills` to pre-fill everything, including which
  professions/skills were already picked.
- **Step — Basics:** headline, about, town, postcode_district
  (uppercased client-side, outward-district only per non-negotiable
  #6), profession picker (checkboxes from `GET /professions`, a primary-
  profession dropdown that only appears once 2+ are checked). Uses the
  **existing** `PATCH /candidates/me` and `PUT /candidates/me/
  professions`.
- **Step — Skills:** clinical skills picker, grouped by family. Uses the
  **existing** `PUT /candidates/me/skills`.
- **Step — Availability & logistics:** availability state (with a
  conditional "available from" date field), shift preferences, travel
  radius, minimum rate, right-to-work status (with a conditional visa-
  expiry field for the two visa-related options), driving licence/
  vehicle. Uses the **existing** `PATCH /candidates/me`. No sponsorship
  language anywhere — this is a self-declared status field, not an offer
  (non-negotiable #8 still respected in spirit).
- **After step 3**: an honest holding screen ("rest of the wizard —
  coming soon"), not a redirect to `/dashboard` and not
  `onboarding_done = true` — Sprints 3–5 add the remaining steps to this
  same wizard before it's actually complete.
- **Verified**: RLS checked directly against the schema before writing
  the routes (not assumed). `tsc --noEmit` clean, `wrangler deploy
  --dry-run` bundles cleanly, 6-viewport responsive audit (zero
  overflow). Since this sandbox can't reach Supabase, the wizard's JS
  was exercised directly with headless Chromium and mocked API
  responses shaped exactly like the real endpoints: confirmed the full
  step 1→2→3→4 flow advances correctly, the conditional visa-expiry
  field shows/hides on the right `right_to_work` values, and — with a
  mocked `onboarding_step: 3` — the wizard resumes on step 3 rather than
  restarting at step 1. No uncaught page errors during any of it.

### Sprint 3 — Work history, qualifications, registrations ✅ Shipped

The evidence that actually backs a profile.

- **Step — Employment history:** full CRUD, **existing** API
  (`/candidates/me/employment-history`), new wizard UI (step 4) for
  add/edit/delete via an inline record-card list + form. No manual
  reorder in this sprint — `sort_order` defaults to 0 for every row;
  reordering is deferred, not scoped to Sprint 3.
- **Step — Qualifications:** **new routes shipped** for `qualifications`
  (create/list/update/delete + `POST .../:id/evidence` for R2 upload).
  **Correction against this doc's original assumption**: `status`
  actually starts `none` (the real DB default, checked directly against
  the schema, not `submitted` as first assumed here) — a qualification
  is only "submitted" once evidence is actually uploaded, which reads
  truer to the enum's own semantics (`none → submitted → under_review →
  accepted/rejected/expired`). New public `GET /qualification-types`
  reference route added (same pattern as `/professions`, `/skills`).
- **Step — Registrations:** **new routes shipped** for `registrations`
  (create/list/update/delete). `status` starts `submitted` (DB default,
  matches this doc's original assumption) — a registration is a
  factual claim (regulator + reg number) made up front, unlike a
  qualification.
- Both qualifications and registrations land in `submitted`/
  `under_review` with no reviewer UI yet — review happens manually via
  the Supabase dashboard for now. An admin review tool is real scope,
  deliberately not in this sprint (see "Explicitly not scheduled" below).
- Wizard now spans 6 real steps + a holding screen (was 3 + holding
  after Sprint 2) — step dots/labels expanded accordingly. Found and
  fixed two real layout bugs during the responsive audit: the 6-label
  row overflowed horizontally at narrow widths (fixed by giving each
  label an equal flex column with `min-width: 0` instead of
  `justify-content: space-between`, which doesn't let text shrink), and
  record-card action buttons overlapped the title text when both
  didn't fit on one row (fixed with `flex-wrap: wrap` so actions drop
  to their own line instead of squeezing the title into a sliver).

### Sprint 4 — DBS, references, self-expression prompts ✅ Shipped

The compliance-sensitive steps — written carefully, not fast.

- **Step — DBS status + consent:** **new routes shipped** —
  `GET/PUT /candidates/me/dbs`. `dbs_records` is a singleton per
  candidate (`candidate_id` is the primary key, checked directly
  against the schema), so this is an upsert, not list CRUD.
  `consent_given_at` is server-stamped the moment `consent_to_check`
  first flips true, and cleared if consent is withdrawn — never
  client-supplied, so it's an honest record of when consent was
  actually given. Copy says *"Enhanced DBS"* / *"I'm registered on the
  DBS Update Service"* — never "verified/certified/checked"
  (non-negotiable #3). `certificate_number` is captured but marked
  "kept private" on the form; never exposed pre-shortlist once
  employer search exists. Skipping this step (no DBS yet) doesn't
  create a row — `level` is `NOT NULL` with no default, so an empty
  form correctly just advances without writing anything.
- **Step — References:** **new routes shipped** — full CRUD on
  `candidate_references` (referee name/org/email/relationship), same
  record-card pattern as employment/qualifications/registrations. Reg
  22 (non-negotiable #7) requires two references confirmed *before a
  placement*, not necessarily before publish — this sprint collects
  referee details; the actual referee-response flow
  (`candidate_references.token`, outbound email to the referee) is
  still deferred to a later sprint since it needs real outbound email,
  blocked on the same parked domain/Sender.net work.
- **Step — Prompts:** **new routes shipped** — `GET /candidates/me/
  prompts`, `PUT/DELETE /candidates/me/prompts/:promptId` (upsert per
  `(candidate_id, prompt_id)`, the real primary key). New public
  `GET /prompts` reference route serves the 6 real prompts already
  seeded in the DB (`good_at_not_cv`, `work_best_with`, `why_care`,
  `proud_moment`, `need_from_employer`, `difficult_day`) — this is the
  "your own voice" positioning from the landing page copy, made real.
  Answering any prompt is optional.
- **Progress-indicator redesign**: the wizard grew to 9 real steps +
  a holding screen. The per-step label row (already patched once in
  Sprint 3 for 6 labels) would not have scaled to 9 without shrinking
  to illegibility, so it's replaced with a single dynamic line ("Step
  7 of 9 · DBS & consent") above the dots instead of one label per
  dot. More scalable for the remaining Sprint 5 steps, and removes a
  whole class of "N labels don't fit in the row" bugs going forward.

### Sprint 5 — Photo, review, publish, candidate home ✅ Shipped

Close the loop: zero to a real published profile.

- **Step — Photo (step 10):** **existing** `POST /candidates/me/photo`,
  plus a **new** `GET /candidates/me/photo` to actually get the bytes
  back for a preview (didn't exist — no route served R2 objects at
  all before this). Scoped to the caller's own key
  (`candidates/{userId}/photo`), never a general `/media/:key` route,
  so there's no key-enumeration surface.
- **Review step (step 11):** live completeness %, computed client-side
  using the **exact** same 8-factor breakdown as the DB's
  `profile_completeness()` function (professions 15, postcode 10,
  availability 10, right-to-work 10, employment history 20, DBS 10,
  prompts 15, photo 10 = 100) — read the function body via SQL first
  rather than guessing weights. A per-section summary with inline
  "Edit" links (jump straight back to that step, same page, no
  reload).
- **Publish:** **existing** `POST /candidates/me/publish` RPC — reading
  its actual definition first (not assumed) surfaced two things this
  doc didn't know: (1) it already sets `onboarding_done = true` on
  success, so the dedicated `onboarding/complete` route from Sprint 2
  stays permanently unused by design — publishing *is* the completion
  signal; (2) it gates on a `can_publish()` function requiring
  profession + employment history + postcode + right-to-work ≠
  `not_stated`, returning `false` (not an error) if unmet. The wizard
  mirrors those exact 4 conditions client-side to show a specific
  "still needed" checklist rather than a generic failure.
- **Candidate home/dashboard:** replaces the Sprint 1 stub outright.
  View-only for individual fields (no duplicate edit UI — "Edit"
  buttons route back into the wizard via a new `?step=N` override that
  lets it jump to an already-completed step instead of always
  resuming at the highest one). **New** `GET /candidates/me/badges`
  (read-only, joins the `badges` reference table for label/grade/
  family) renders badges grouped by family, with a genuinely distinct
  visual treatment per grade (`verified`/`evidenced`: solid fill;
  `derived`/`declared`: outline; different colors each) per
  non-negotiable #2. Account settings: **new**
  `POST /candidates/me/close-account` wrapping the **existing**
  `close_my_account()` RPC, behind a two-step confirm (not a native
  `confirm()` dialog).

**→ Candidate track complete here.** A candidate can sign up, complete a
real onboarding wizard, and have a published, evidenced profile.

---

## Employer track (after the candidate track ships)

**Revised** after a scope discussion prompted by the employer landing
page v2 brief, which described a much bigger product than the original
Sprints 6–10 below assumed. Decisions made (see `PROGRESS.md` for the
full discussion):

- **Chat is the primary interface from day one** — not a fast-follow
  layer over traditional UI. Employers land on a single chat input after
  sign-in; search, shortlist, pipeline moves, and questions all go
  through it.
- **Pipeline stages are fixed for the first release**: Shortlisted →
  Interview → Offer → Hired (+ a non-active `rejected`/`archived` state).
  Per-employer configurability is explicitly deferred.
- **AI-parsed async video interviews are a separate, later initiative**
  — not in this track at all. New infrastructure (video capture,
  storage, transcription), and the brief itself says this needs its own
  scoping session.
- **iCompliance (an employer's own compliance checklist/workflow per
  hire) is real, scoped, and deliberately not urgent** — captured at the
  bottom of this track as Sprint 12, not scheduled. Don't start it
  without the user asking first.

> **⚠️ Non-negotiable #4 overridden for search results — founder
> decision, 2026-08-26.** The paragraph below documents what #4
> originally required and why. The user has since explicitly instructed:
> *"i command you to not let it interfere with planning for now... When
> the employer searches the AI should generate the names, current job
> title and location of the candidate."* That instruction stands and is
> what Sprint 8 is now built against — **pre-shortlist results show
> name, current job title, and location.** This is a real, deliberate
> departure from the original identity-blind design, not an oversight;
> flagged clearly once when the instruction was given, not re-litigated
> here. If this ever needs revisiting, the compliance reasoning below is
> why it existed in the first place.

~~Hard constraint carried over from non-negotiable #4~~ (superseded,
kept for context): pre-shortlist search results were meant to exclude a
candidate's name — not even a first name or "Aoife M."-style partial —
because a first name signals gender and often ethnicity, which is the
Equality Act exposure #4 exists to prevent. Photo, video, and CV file
**remain excluded pre-shortlist** — the override above is scoped to name
+ job title + location only, nothing else in #4 changed.

### Sprint 6 — Employer sign-up / sign-in UI ✅ Shipped

Mirrors Sprint 1 for `role: "employer"`, collecting `org_name` at
signup. Same **existing** `/auth/*` routes, same Sprint 0 auth helper —
no new backend routes, confirmed against `handle_new_user()`'s real SQL
before assuming so: it already creates the `employers` row (`org_name`,
`is_verified: false`) *and* an `employer_verification_requests` row
automatically on employer signup. Sprint 7's routes are for
reviewing/completing that request, not creating it from scratch.

- **`src/employer-sign-in.html`** (new, mounted at `/employer/sign-up` +
  `/employer/sign-in`): same one-file toggle pattern as
  `src/sign-in.html`, but themed to `employers.html`'s own purple/teal
  design system rather than reusing the candidate pages' plum/teal, and
  collecting an organisation name field alongside name/email at signup.
  Posts `role: "employer"` to the existing `POST /auth/request-code`.
- **`src/verify.html`** (shared by both audiences, not duplicated): now
  reads an optional `?role=` hint (set by whichever sign-in page
  redirected here) purely to steer the "use a different email" link and
  the offline fallback landing page — the actual post-verify redirect is
  decided authoritatively by the account's real role from the
  **existing** `GET /auth/me`, never trusted from the query param.
  Employers land on `/employer/home`; candidates keep the pre-existing
  `onboarding_done` check against `/candidates/me` unchanged.
- **`src/employer-home.html`** (new stub, mounted at `/employer/home`):
  the non-broken landing target for a signed-in employer, playing the
  same role Sprint 1's `onboarding.html`/`dashboard.html` stubs played
  for candidates before later sprints built the real thing. Deliberately
  minimal — greets by name via the existing `GET /auth/me`, shows a
  static "verification pending" status and a 3-item roadmap
  (verification → chat search → pipeline), no new routes. Sprint 7+
  replaces its body with the real thing.
- Cross-links added both directions: candidate sign-in gets "Hiring
  instead? Employer sign in", employer sign-in gets "Looking for work
  instead? Candidate sign in" — someone landing on the wrong audience's
  page isn't stuck.
- The employer landing page (`/employers`) itself is untouched — stays
  waitlist-only for now, same as the candidate landing page was left
  unlinked to `/sign-in` after Sprint 1. Pre-launch marketing pages and
  the real signed-in product are deliberately separate until launch.
- **Verified**: `tsc --noEmit` clean, `wrangler deploy --dry-run` bundles
  cleanly. Exercised with headless Chromium against mocked
  `/auth/verify-code` + `/auth/me` responses: an employer login correctly
  redirects to `/employer/home` and never calls `/candidates/me`; a
  candidate login is unaffected (still redirects to `/onboarding` or
  `/dashboard` based on `onboarding_done`, confirmed both branches); the
  unauthenticated `employer-home.html` guard redirects to
  `/employer/sign-in?next=...`; the signup form's actual POST payload
  confirmed `role: "employer"` and the typed organisation name reach the
  server correctly. (Navigation itself can't complete under `file://` in
  this sandbox with no server behind it — verified via the attempted
  navigation request's URL instead of the final page, same limitation
  noted elsewhere in this doc.) 5-viewport overflow audit across all 4
  new/changed pages (including the employer-themed form in both sign-in
  and sign-up mode) — zero horizontal overflow anywhere.

### Sprint 7 — Employer verification flow ✅ Shipped

- **New `src/employers.ts`** router, mounted at `/employers`. Checked
  the real schema before writing anything: `employers.is_verified` is
  the actual gate the **existing** `is_verified_employer()` RPC checks,
  and it can only be flipped by `service_role` — a DB trigger
  (`lock_employer_verification()`) enforces this, read its real SQL
  first rather than assumed. `employer_verification_requests` is
  append-only by RLS (INSERT + SELECT only, no UPDATE policy exists) —
  each submission is a new audit row, not an edit of a previous one, and
  there's no unique constraint on `employer_id` confirming multiple rows
  per employer is the intended design.
  - `GET /employers/me` — the employer's own row (`org_name`,
    `companies_house_no`, `regulator`, `regulator_reg_number`,
    `is_verified`) plus their full verification-request history, newest
    first.
  - `POST /employers/me/verification-requests` — submits (or
    re-submits) for review. **Companies House number is required**; a
    care regulator + registration number are optional supplementary
    evidence, required together if either is given. `submitted_org_name`/
    `submitted_email` are stamped server-side from the employer's own
    current record, never trusted from the client (same philosophy as
    the DBS route's server-stamped `consent_given_at`). Always updates
    the current `employers.companies_house_no` (and `regulator`/
    `regulator_reg_number` if given) so the "claimed" values and the
    latest submission stay in sync.

  **⚠️ Correction, 2026-08-26** (superseding the original design above):
  shipped CQC-only — "at least one of CQC provider ID or Companies House
  number." Founder feedback the same day: not every UK care employer is
  CQC-registered (Scotland's Care Inspectorate, Northern Ireland's RQIA,
  Wales's CIW cover the same ground in their nations), and region-
  specific agency-licensing checks were explicitly deprioritised —
  "carry them on as long as they are a UK based company with companies
  house registration." Migration `0012_employer_verification_multi_
  regulator` renamed `cqc_provider_id` → `regulator_reg_number` and
  added a `regulator` enum (`cqc` / `care_inspectorate_scotland` /
  `rqia` / `ciw`) on both `employers` and `employer_verification_
  requests`, plus a new `companies_house_no` column directly on
  `employers`. Companies House number is now the required field; the
  bullets above already reflect the corrected behavior.
- **UI** (`src/employer-home.html`, replacing the Sprint 6 static
  "pending" line): a real verification card driven by `GET
  /employers/me` — a distinct visual state (and copy) for no-identifier-
  yet, submitted/under-review, rejected (shows `reviewer_note`), and
  verified (form hides entirely once `is_verified` is true). No
  candidate search exists yet to actually gate — that's Sprint 8 — so
  this sprint's scope is the verification flow itself, not the gate.
- Review is manual (Supabase dashboard) for now, same reasoning as
  Sprint 3's qualifications/registrations — no admin UI in this sprint.
- **Verified**: `tsc --noEmit` clean, `wrangler deploy --dry-run`
  bundles cleanly. Exercised with headless Chromium against mocked
  `GET /employers/me` responses covering all 4 states (no-identifier,
  under-review, rejected-with-note, verified) plus a live form
  submission (confirmed the POST body and success/validation messaging).
  5-viewport overflow audit on the rejected state (longest content, incl.
  a long reviewer note) — zero horizontal overflow anywhere.

### Sprint 8 — Chat infrastructure + candidate search ✅ Shipped

The foundation everything else in this track sits on.

- **LLM tool-calling loop on the Worker — Workers AI, not the Claude
  API.** This section originally specced the Anthropic API; superseded
  by the founder's standing cost preference (see the CV import switch —
  `HANDOVER.md`). `env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  {messages, tools})` with native function-calling, same model already
  used for CV parsing. No `ANTHROPIC_API_KEY` needed. The model's job is
  narrow: translate the employer's natural-language message into a
  `search_candidates` tool call. **It never sees search results at
  all** — the reply an employer sees after a search is always a fixed,
  deterministic template sentence ("Found N candidates matching your
  search"), never model-generated prose about who matched. That's what
  makes non-negotiable #5 ("descriptive, not evaluative") true by
  construction, not by prompting.
- **Protected-characteristics guardrail — three independent layers**,
  not one (see `src/employer-chat-guardrail.ts`'s own comment for the
  full reasoning):
  1. *Structural*: the `search_candidates` tool schema has no field
     that could even encode age/sex/race/religion/disability/etc. —
     nowhere to put it, matching CV import's sensitive-data philosophy.
  2. *Deterministic keyword/proximity check*, run in code *before* the
     message ever reaches the model — the actual "real check, not just
     a prompt instruction" non-negotiable #5 demands. Verified against
     30 adversarial + legitimate test cases (see PROGRESS.md), including
     two real bugs caught and fixed during testing: a strict-adjacency
     match that let "female care staff preferred" through (fixed with a
     bounded-proximity match instead of `\s+`), and an over-broad
     trigger word ("people") that then false-blocked completely
     standard care-sector phrasing like "experience working with young
     people" — describing the *client population*, not the candidate.
  3. *System prompt instruction*, pure defense-in-depth, not the
     primary control.
- **`search_candidates` tool**: natural language → structured filters
  (profession, skills, town, travel radius, availability) → a
  deterministic query against `candidate_search` (migration 0013,
  rewritten this sprint). No ranking, no scoring. Tool-call arguments
  are never trusted as-is — every id is checked against the live
  `professions`/`clinical_skills` tables and dropped if invalid, same
  defense-in-depth pattern as CV import's `sanitizeParsed()`.
- **`candidate_search` view corrected on two fronts** while rebuilding
  it: (1) it had **no verification gate at all** — any authenticated
  role able to query it saw every published candidate regardless of
  `is_verified_employer()`; the view's `WHERE` clause now requires it
  explicitly. (2) it lacked the founder's non-negotiable #4 override
  fields entirely (name, current job title) — added via a join to
  `accounts.full_name` (never email/phone) and a `LATERAL` join to the
  candidate's current `employment_history` row. Views created by the
  migration role run with that role's table privileges, which is why
  this is safe without granting employers any direct RLS access to
  `accounts`/`employment_history` — the view's own column list is the
  only exposure surface, same reason `candidate_search` worked at all
  pre-Sprint-8 with no RLS policy of its own.
- **Chat UI** (`src/employer-home.html`, replacing the "coming soon"
  list item): single input + persisted message thread, shown only once
  `employer.is_verified`. New `employer_chat_messages` table (RLS
  self-only) persists the conversation, including a `results_snapshot`
  of each search's result rows, so a page reload replays real result
  cards, not just a text summary. Result cards show badges with a
  grade-distinct style (non-negotiable #2), reusing a new public
  `GET /badges` reference route (same pattern as `/professions`/
  `/skills`).
- **Result fields — per the founder override**: candidate's name, current
  job title, and location, plus role/badges/experience/skills.
  **Photo, video, and CV file stay excluded pre-shortlist** — the
  override didn't touch those, and `candidate_search` structurally
  can't leak them (those columns were never added to the view).
- **Verified**: `tsc --noEmit` clean, `wrangler deploy --dry-run` bundles
  cleanly. The guardrail's 30-case test suite (above) run standalone in
  Node. Exercised the full chat UI with headless Chromium against mocked
  responses: unverified employers never see the chat section; a verified
  employer's persisted history (including snapshotted result cards)
  replays correctly on load; sending a message posts the right body and
  renders the reply plus result cards; a guardrail redirect renders with
  no results; a zero-result search renders no cards. Re-ran the Sprint 7
  verification-form suite afterward to confirm the layout changes (wider
  `.wrap` for the chat card) didn't regress it — caught and fixed one
  real bug in the process: `loadChatHistory()` had no `.catch()`, unlike
  every other fetch in the file, throwing an unhandled rejection when
  the request failed. 5-viewport overflow audit on the chat+results
  state (long candidate name, long job title/employer, long user
  message) — zero horizontal overflow anywhere.

### Sprint 9 — Shortlist + fixed pipeline, via chat

- **New tool — `shortlist_candidate`**: chat command ("shortlist them")
  → `POST /shortlists` (**new route**, table already exists).
- **New schema**: `shortlists` needs a `stage` column (`shortlisted` /
  `interview` / `offer` / `hired` / `rejected`, default `shortlisted`,
  check-constrained) — doesn't exist yet, matches the "fixed stages"
  decision above.
- **New tools** — `move_candidate_stage` (advance/change stage via chat
  command) and `get_pipeline_status` (chat query: "how many candidates
  are in my pipeline").
- **Candidate-side, adjusted for the Sprint 8 override**: see incoming
  shortlists, consent to unlock (`shortlists.candidate_consented_at`).
  Name/job title/location are already visible from search (per the
  founder override), so consent now unlocks **photo, video, and CV**
  specifically. Full contact details and the DBS certificate number stay
  separately gated — Reg 22 territory (non-negotiable #7), confirmed
  before an actual placement, not just on shortlist.

### Sprint 10 — "Who is [name]" AI summary

- **New tool — `who_is_summary`**: for a shortlisted + consented
  candidate only, an AI-generated descriptive summary combining
  structured profile data
  (experience, skills, qualifications, employment history,
  `candidate_prompts`). **Deliberately v1-scoped to structured data
  only** — the brief's fuller vision also draws on candidate self-
  expression posts, which don't exist yet (still phase 2, §9). Don't
  wait for posts to ship this.
- Strict compliance, same family as the search guardrail: descriptive
  only — no "strong candidate," "good fit," or other evaluative
  language. This is the sharpest edge of non-negotiable #5 in the whole
  employer product; get a second look on the actual prompt before
  shipping, not just at review time.

### Sprint 11 — Bulk chat commands + employer dashboard

- **New tool — bulk pipeline actions**: compound commands like "send an
  offer to everyone successful in the last two weeks" (pipeline stage +
  date range → bulk stage transition). Builds on Sprint 9's stage
  column.
- A minimal employer dashboard/history view — chat is the primary
  interface, but a lightweight fallback view of shortlists, pipeline,
  and org profile is still needed (not a reversal of the chat-first
  decision, just a supporting view).

**→ Employer track complete here (excluding Sprint 12, not scheduled —
see below, and video interviews, tracked separately).** A verified
employer can search and manage their pipeline entirely through chat,
compliantly, and (with candidate consent) see enough to make contact.

### Sprint 12 — iCompliance (not scheduled)

Employer's own compliance checklist/workflow per hire (contracts,
right-to-work checks, induction records, etc.) — genuinely scoped, not
just a name, but **explicitly not urgent**. Don't start this without the
user asking for it first; it's captured here so the scope isn't lost.

---

## Explicitly not scheduled above (known, deliberately deferred)

- **Admin review tooling** for qualifications/registrations/employer
  verification — every sprint above that lands something in `submitted`/
  `under_review` assumes manual review via the Supabase dashboard until
  volume justifies building this. Worth a dedicated sprint once real
  users exist.
- ~~Candidate self-expression posts~~ — shipped 2026-08-26 (same day as
  Sprint 8), on direct founder instruction, open-by-default consent model
  (superseding §9's original per-post-consent brief — see PROGRESS.md's
  "⚠️ Correction" note). Search integration lives in Sprint 8's
  `employer-chat.ts` (`post_topic` field + isolated per-candidate AI
  summarization), not a separate sprint. Not built: a peer-facing feed —
  no surface exists for "visible to other candidates only," and none was
  asked for.
- **AI-parsed async video interviews** — a separate, later initiative
  per the scope discussion above, not part of the employer track's
  Sprints 6–11. New infrastructure (video capture, storage,
  transcription) and its own compliance question (the copy brief's own
  note: parsing output must stay descriptive, not evaluative, "strong
  communicator"/"hesitant" language would cross the same line as the
  "Who is X" summary). Needs its own scoping session before sprint-izing.
- **iCompliance** — Sprint 12 above. Scoped (employer's own compliance
  checklist/workflow per hire), genuinely real, deliberately not
  scheduled. Don't start without the user asking.
- **Anything needing real outbound email** (reference-response emails,
  the waitlist welcome email, Sender.net integration itself) — blocked
  on the parked custom-domain work. Flag it when picked back up rather
  than silently working around it.
- **Two-factor auth for employers** — deferred per `HANDOVER.md` §12
  until real shortlists exist.
