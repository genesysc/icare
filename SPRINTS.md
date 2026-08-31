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

- ✅ **Shipped 2026-08-26 (partial)** — `shortlist_candidates`,
  `move_candidate_stage`, `get_pipeline_status` chat tools all live in
  `employer-chat.ts`; `shortlists` has its `stage` column (migration
  `0016`, `shortlisted` / `interview` / `offer` / `hired` / `rejected`,
  text + check-constrained, not a native enum, specifically so the list
  can be extended later without an `ALTER TYPE` dance); a read-only
  "iRecruit" pipeline card on `employer-home.html` shows the grouped
  result. Also folded in two founder-requested search filters
  (`min_experience_years`, `qualification_type_id`) in the same pass —
  see PROGRESS.md for full detail.
  - **`shortlist_candidates` takes a count, never named individuals** —
    "shortlist 10 of them" takes the first 10 from the MOST RECENT
    search results in the conversation, in the order returned (now
    deterministic — `candidate_search` gained `order by c.id`). Founder
    confirmed this explicitly rather than free-form name-based selection,
    to keep it structurally non-evaluative (no "AI picks the best 10").
  - **Not built**: the candidate-side consent-to-unlock-photo/video/CV
    flow described below (still real, still needed) — this pass covers
    the employer-facing chat + pipeline-view half only. `shortlists.
    candidate_consented_at` already exists in the schema (from `0001_init`)
    but nothing sets it yet.
- ✅ **Remainder shipped 2026-08-26** — candidate-side consent flow
  (`set_shortlist_consent()` RPC, migration `0017`; `GET/POST
  /candidates/me/shortlists*`; a candidate-facing "Employer interest" card
  on `dashboard.html`), plus employer-facing consent-gated
  `GET /employers/candidates/:id/{photo,video,cv}` routes, wired into the
  iRecruit pipeline card. Candidate video upload (`POST/GET/DELETE
  /candidates/me/video`) built alongside this, since `intro_video_path`
  existed in the schema but nothing ever wrote to it. Migration `0018`
  adds a narrow `employers` read policy so a candidate can see who
  shortlisted them (needed to decide whether to consent — `employers` had
  no candidate-facing read policy at all before this).

### Sprint 10 — "Who is [name]" AI summary ✅ Shipped 2026-08-26

- **New tool — `who_is_summary`**: for a shortlisted + consented
  candidate only, an AI-generated descriptive summary combining
  structured profile data (experience, skills, qualifications,
  employment history, `candidate_prompts`). Backed by a new
  `get_candidate_dossier()` security-definer RPC (migration `0019`) —
  `employment_history`/`qualifications` had **no employer-facing RLS
  policy at all** (checked `pg_policy` directly, not assumed), so one
  narrow, audited RPC replaces what would've been RLS policies bolted
  onto five different tables.
- **Deliberately v1-scoped to structured data only** — candidate posts
  (which now exist, shipped same day as Sprint 8) are intentionally
  excluded: synthesizing a candidate's own narrative posts into a
  combined "who is this person" summary is a more evaluative-shaped
  framing than the isolated single-post excerpt search already does, and
  needs its own compliance look before folding in, not a silent decision
  made inside this sprint.
- **Two independent controls, not one** — same "real check, not just a
  prompt instruction" standard as the search guardrail: (1) the system
  prompt instructs strictly descriptive output — no "strong candidate,"
  "good fit," or similar; (2) a new deterministic
  `containsEvaluativeLanguage()` output-side scan (`employer-chat-
  guardrail.ts`) — if the model's output trips it anyway, the reply falls
  back to a template built only from structured fields, never ships
  evaluative prose on trust that the prompt worked. Verified against 8
  evaluative + 6 legitimate-descriptive test cases, all correct.

### Sprint 11 — Bulk chat commands + employer dashboard ✅ Shipped 2026-08-26

- **New tool — `bulk_move_stage`**: compound commands like "send an
  offer to everyone successful in the last two weeks" (pipeline stage +
  optional `since_days` → bulk stage transition, deterministic SQL
  filter, never the model picking individuals). Builds on Sprint 9's
  `stage`/`stage_updated_at` columns.
- **Minimal employer dashboard piece**: pipeline and shortlists were
  already covered by Sprint 9's iRecruit card (a shortlist row *is* a
  pipeline entry — no separate concept to build); what was actually
  missing was org profile, which disappeared entirely once verified (the
  verification form hides on `is_verified`). Added a small read-only
  "Organisation" summary block shown in its place — not a new page, chat
  stays the primary interface.

**→ Employer track complete here as of 2026-08-26 (excluding Sprint 12,
not scheduled — see below, and video interviews, tracked separately).**
A verified employer can search and manage their pipeline entirely
through chat, compliantly, and (with candidate consent) see photo,
video, and CV, and get a descriptive profile summary.

### Sprint 12 — iCompliance (not scheduled)

Employer's own compliance checklist/workflow per hire (contracts,
right-to-work checks, induction records, etc.) — genuinely scoped, not
just a name, but **explicitly not urgent**. Don't start this without the
user asking for it first; it's captured here so the scope isn't lost.

---

## Employer-track reconciliation, 2026-08-30 — Sprints 13–17

Three independently-uploaded documents (the B2B workflow handover, the
jobseeker/employer wireframes, and the Next.js reference app's
`lib/types.ts`) all describe employer-side mechanics that diverge from
what Sprints 6–11 above actually shipped — see `HANDOVER.md` §14 for the
full comparison table and reasoning. Founder confirmed 2026-08-30: migrate
now, not later. Stage mapping for in-flight data:
`interview → invited_for_interview`, `offer → pending_interview_result`,
`hired → successful` (`shortlisted` and `rejected` keep their names,
`onboarding` is new). Sequenced as five sprints, in dependency order —
each is its own PR, not one giant migration, per this repo's usual
convention:

### Sprint 13 — Jobs module ✅ Shipped 2026-08-30

The actual prerequisite for everything below: nothing else in this
reconciliation can happen until a job record can exist. New `jobs` table
(employer-owned, never public/candidate-facing/browsable — does **not**
reopen the "no job postings" decision, see `HANDOVER.md` §14). Structured
fields are explicit employer input (title, location, pay range, hours,
contract type, notice period, qualifications required, H&S risks); the
description body is AI-drafted from those, employer-confirmed before
saving — same propose/confirm pattern as CV import. Mandatory three-state
`sponsorship_offered` field (none / can sponsor an existing Health & Care
Worker visa holder switching employer / can sponsor a new applicant) —
the third option is **DB-enforced unblocked only for professions other
than `care_assistant`/`senior_carer`** (this schema's ids for what the
immigration non-negotiable calls Care Worker/Senior Care Worker), not
left to employer honesty. `shortlist_candidates` (renamed conceptually to
Send Invite once Sprint 14 lands) will require a `job_id` — until then,
this sprint alone just makes job records creatable and listable; it does
not yet touch the chat tool.

**Shipped**: migration `0020_jobs` (table + `jobs_sponsorship_restricted_
roles` check constraint + `jobs_employer_self` RLS policy, applied to the
real project and mirrored to `supabase/migrations/`), new `src/jobs.ts`
(mounted at `/employers/jobs`): `POST /draft` (Workers AI drafts
`description_body` from title/location/hours/pay, plain-text completion,
no JSON mode needed for a single free-text field), `POST /`, `GET /`,
`GET /:id`, `PATCH /:id` (blocked once `status = 'closed'`), `PATCH /:id/
close`. `validateJobInput()` duplicates the DB check as a friendly 400,
same belt-and-braces pattern as `sanitizeParsed()` in `candidates.ts`.
Verified directly against the real schema (this sandbox still can't reach
Supabase from `wrangler dev`): a `new_applicant` + `senior_carer` insert
correctly rejected by the check constraint, a `transitional_switch_only` +
`senior_carer` insert correctly succeeded, test row deleted, table back to
0 rows. `tsc --noEmit` clean, `wrangler deploy --dry-run` bundles cleanly.
Not yet pushed as a PR.

### Sprint 14 — Bookmark/Send Invite split + six-stage pipeline ✅ Shipped 2026-08-30

Two changes landed together since they both touch `shortlists`/the chat
tools in the same places: (1) split the old single `shortlist_candidates`
action into a private, no-consequence `bookmark_candidates` tool (own
`bookmarks` table, no pipeline entry, zero effect on searchability) and a
`send_invite` tool requiring a `job_id` from Sprint 13's jobs (hard gate —
the tool call fails without a valid, active job) and snapshotting the
job's details onto the invite (`shortlists.job_snapshot`, jsonb) so a
later edit to pay/hours can't retroactively change what a candidate
consented to; (2) migrated `shortlists.stage`'s check constraint from the
five-value set to the six-stage set (`shortlisted`/`invited_for_
interview`/`pending_interview_result`/`successful`/`rejected`/
`onboarding`), per the founder-confirmed mapping.

**Shipped**: migrations `0021_bookmarks_and_six_stage_pipeline` (bookmarks
table, `shortlists` gains `job_id`/`job_snapshot`, stage constraint
migrated) and `0022_shortlists_unique_per_job` — a real bug caught while
building this, not planned in advance: the pre-existing uniqueness on
`shortlists` was `(employer_id, candidate_id)` only, which made it
*impossible* for a candidate to hold two pipelines at once with the same
employer (one per job), directly contradicting the workflow handover's
"the same candidate can legitimately sit in more than one pipeline at
once for the same company." Fixed to `(employer_id, candidate_id,
job_id)`.

`src/employer-chat.ts` rewritten: `bookmark_candidates` and `send_invite`
tools (replacing `shortlist_candidates`), `move_candidate_stage` now
addresses pipeline entries by `pipeline_id` (the `shortlists` row's own
id) rather than `candidate_id` — candidate_id alone became ambiguous the
moment one candidate could have multiple pipelines with the same
employer. System prompt gained an active-jobs catalogue so the model can
resolve "invite them to the senior carer role" to a real `job_id`, and
now explicitly distinguishes bookmark from invite so it doesn't guess
wrong on an ambiguous "shortlist them." `get_pipeline_status`/
`bulk_move_stage` updated to the six-stage set and human-readable labels.
New `GET /employers/bookmarks` + `DELETE /employers/bookmarks/:candidateId`
read routes (`src/employers.ts`); `/pipeline` now surfaces `job_title`
per entry, since that's now the only thing distinguishing two pipelines
for the same candidate. `src/candidates.ts`'s `/me/shortlists` and both
`dashboard.html`/`employer-home.html`'s stage-label maps and pipeline/
shortlist row rendering updated to match (job title shown, six-stage
labels instead of raw slugs).

**Verified directly against the real schema** (same reasoning as Sprint
13 — this sandbox still can't reach Supabase from `wrangler dev`): two
`send_invite`-shaped inserts for the *same* candidate against two
*different* test jobs both succeeded (proving the old constraint really
was the bug, and the fix works); a `move_candidate_stage`-shaped update
by `pipeline_id` moved only the targeted entry, confirmed the sibling
pipeline for the same candidate was untouched; a bookmark insert
succeeded independently. All test rows (2 jobs, 2 shortlists, 1 bookmark)
deleted afterward, all three tables confirmed back at 0 rows. `tsc
--noEmit` clean, `wrangler deploy --dry-run` bundles cleanly (1177 KiB /
241 KiB gzip).

**Deferred, flagged rather than half-built**: search exclusion scoped to
(company × job) — `search_candidates` doesn't take a job_id today, so
true per-job exclusion isn't meaningful yet without also making search
itself job-scoped, a bigger UX change than this sprint's stated scope.
Revisit when/if the founder wants search itself tied to a specific job
rather than general-purpose. Not yet pushed as a PR.

### Sprint 15 — Scoped, revocable, frozen-at-acceptance profile access ✅ Shipped 2026-08-30

Replaced `set_shortlist_consent()`'s standing boolean with a grant tied to
the specific pipeline's life: access checks are now "is there a currently-
active pipeline," not "was ever granted," and a closed/rejected/withdrawn
pipeline actively revokes rather than just failing to renew.

**Shipped**: migrations `0023_pipeline_scoped_access_and_frozen_summaries`
(new `shortlists.closed_at`; `set_shortlist_consent()` re-scoped from
`(p_employer_id, p_consent)` to `(p_shortlist_id, p_consent)` — a real bug
found while building this, not planned: Sprint 14 made multiple pipelines
per employer possible but this RPC still matched by employer_id alone, so
consenting to one job's invite would have silently consented/withdrawn
*every* pipeline with that employer; `get_candidate_dossier()` gained the
same `closed_at is null` check; new `profile_summaries` table — frozen
`factual` jsonb + AI-generated `descriptive` text, RLS with candidate/
employer SELECT but no UPDATE/DELETE policy anywhere, since the absence
*is* the "frozen" guarantee) and `0024_profile_summaries_employer_insert`
(a second real gap found mid-build: `who_is_summary`'s live-generation
fallback runs as the employer, but only a candidate-scoped INSERT policy
existed — the backfill would have silently failed RLS every time).

`src/candidates.ts`: consent route re-scoped to `/me/shortlists/:id/
consent` (was `:employerId/consent`); on first `consent: true`, generates
and freezes the profile summary (factual data via direct RLS-scoped reads
across the candidate's own tables, descriptive text via one Workers AI
call over their recent published posts, reusing `containsEvaluativeLanguage()`
from `employer-chat-guardrail.ts` as the same output-side guardrail
`who_is_summary` already used). New `POST /me/shortlists/:id/withdraw`.

`src/employer-chat.ts`: `who_is_summary` re-keyed to `pipeline_id` (same
"candidate_id alone is ambiguous once multiple pipelines exist" fix
already applied to `move_candidate_stage` in Sprint 14), reads the frozen
snapshot when one exists, falls back to live generation + best-effort
backfill for any pre-Sprint-15 row. `move_candidate_stage`/`bulk_move_
stage` now set `closed_at` when moving to Rejected, and refuse to act on
an already-closed pipeline.

`src/employers.ts`: fixed a real regression Sprint 14 introduced but this
sprint caught — `shortlistConsented()`'s `.maybeSingle()` would throw the
moment a candidate held two pipelines with one employer; changed to check
for any open, consented row. `/pipeline` and the two static HTML pages
(`dashboard.html`, `employer-home.html`) updated to show/hide access
correctly once a pipeline closes. `src/jobs.ts`'s close route cascades
`closed_at` to that job's open pipelines.

**Verified directly against the real schema**, simulating `auth.uid()`
per role via `set_config('request.jwt.claim.sub', ...)` (not just
insert/delete checks this time, since this sprint's correctness lives
inside `SECURITY DEFINER` function logic, not just constraints): consent
granted → `get_candidate_dossier` accessible as the employer; pipeline
rejected+closed (in its own committed statement, learned the hard way
after an earlier combined test rolled back on itself) → `get_candidate_
dossier` correctly denied, `set_shortlist_consent` correctly raises "This
pipeline is closed" rather than silently succeeding. All test rows (1
job, 1 shortlist) deleted afterward, all four affected tables confirmed
back at 0 rows. `get_advisors` re-run — no new findings. `tsc --noEmit`
clean, `wrangler deploy --dry-run` bundles cleanly (1185 KiB / 243 KiB
gzip). Not yet pushed as a PR.

### Sprint 18 — Jobseeker Invites screen (frontend) ✅ Shipped 2026-08-31

Sprints 13–15 reconciled the employer-track *backend* against the
wireframe/workflow spec; the jobseeker-facing pages never were. Founder
flagged the mismatch directly after a live-site walkthrough and asked to
start on the frontend — first slice is the wireframe's own "most
important screen": Invites (screen 03) + the invite-detail consent
moment (screen 04), from `docs/mockups/jobseeker-wireframes.html`.

**Shipped**: new `src/invites.html` (`/invites`, registered in
`src/index.ts`) — New/Accepted/Declined tabs derived client-side from
the shortlist row's existing `candidate_consented_at`/`closed_at`
columns (no new status field needed); a detail view per tab matching the
wireframe: undecided invites show the full role (from `job_snapshot`)
plus the "if you accept" panel and Accept/Decline/Decide later; accepted
ones show current stage + Withdraw; declined ones are read-only with the
reason shown back. "Accept" reuses the existing per-pipeline
`POST /me/shortlists/:id/consent`; "decline"/"withdraw" reuse the
existing `POST /me/shortlists/:id/withdraw`, now extended (migration
`0025_shortlist_decline_reason.sql`) with an optional `reason` from a
fixed six-value list matching the wireframe's decline-reason picker
exactly — a real product decision (a decline always sends a reason;
"prefer not to say" is a complete, valid one; there's no option to
decline with nothing shared), not something that could be faked
client-side alone. `dashboard.html` gets a nav link to `/invites` with a
count badge for new (undecided) invites; its own inline shortlist
section was left as-is rather than removed, to avoid breaking working
functionality in the same pass.

**Deliberately not built**, flagged rather than half-built: the
wireframe's 7-day invite auto-expiry countdown (needs an `expires_at`
column set at invite creation in `employer-chat.ts`'s `send_invite`
handler, plus a scheduled job to auto-close and notify the employer on
lapse — real scope beyond a candidate-side screen); the tab-bar app
shell itself (every candidate page is still its own top-level page); a
dedicated Pipelines screen (still folded into `dashboard.html`).

**Verified directly against the real schema** (no real candidates exist
yet in production — Sender.net email sending is still a no-op, so
nobody has completed a real sign-up — same test methodology as prior
sprints): inserted a test `auth.users` row (the `handle_new_user()`
trigger provisions `accounts`/`candidates`/`candidate_contact`
correctly), two test jobs, two test shortlist rows. Simulated the
candidate via `set_config('request.jwt.claims', ...)` + `set local role
authenticated` (each DDL/DML in its own `execute_sql` call after last
sprint's lesson about combined statements rolling back together on
error): declined-with-reason via the exact update the withdraw route
runs — succeeded, `decline_reason` persisted; accepted via
`set_shortlist_consent()` then withdrew with no reason (the "Accepted"
tab's Withdraw action) — succeeded, `decline_reason` stayed null;
attempted an invalid `decline_reason` value — correctly rejected by the
new check constraint, matching the route's own application-level
validation. All test rows (2 shortlists, 2 jobs, 1 candidate + its
`auth.users`/`accounts`/`candidate_contact` rows) deleted afterward, all
five affected tables confirmed back at 0 leftover rows. `get_advisors`
re-run — no new findings beyond what already existed. `tsc --noEmit`
clean, `wrangler deploy --dry-run` bundles cleanly (1213.91 KiB / 248.05
KiB gzip). Same branch/PR as Sprints 13–15 (`claude/jobseeker-employer-
wireframes-rc5uss`, PR #29 — not yet merged).

### Sprint 19 — Tab-bar shell + Pipelines screen ✅ Shipped 2026-08-31

Founder's own sequencing call: "Build the tab-bar shell first, then
Pipelines." Both from `docs/mockups/jobseeker-wireframes.html`'s sitemap
(screen 00, five destinations) and screen 05.

**Shipped**: `src/nav-shell.html` — reference file, same "not imported,
copy verbatim" convention as `auth-client.js` — defines a bottom-fixed
tab bar (Home/Invites/Pipelines/Network/Profile), hand-authored inline
SVG icons (no icon library dependency), an unread dot on Invites driven
by each page's own already-fetched `/me/shortlists` data. Fixed at
every viewport size rather than mobile-only + a separate desktop nav —
this codebase has no other desktop-specific layout (every page is a
single centered column, no breakpoints), so a second pattern wasn't
introduced just for this. Copied into `dashboard.html` (now understood
as the wireframe's Profile tab — it was the only candidate page before
this sprint) and `invites.html` (replacing that page's ad-hoc "Dashboard"
text link from Sprint 18).

New `src/pipelines.html` (`/pipelines`) — wireframe screen 05 — against
the same `GET /me/shortlists` `invites.html` already uses, no new
backend route. Active/Closed tabs, but scoped to `candidate_consented_
at is not null` only: an invite declined before ever being accepted
belongs solely to `invites.html`'s Declined tab, matching the
wireframe's own stated principle ("an invite is a decision you make
once, a pipeline is a state you sit in afterwards"). Detail view renders
a real five-stage tracker (done/current/upcoming dots and connecting
line) plus Rejected as its own terminal marker rather than pretending it
sits on the normal ladder; Withdraw for active pipelines, a closing note
for closed ones (`closeNote()` distinguishes candidate-declined-with-
reason vs. employer-moved-to-rejected vs. job-closed, from the same
`decline_reason`/`stage` data invites.html already has).

**One deliberate deviation from the wireframe's own screen-05 example**,
flagged in `pipelines.html`'s header comment rather than silently
matched: the wireframe shows a "Successful" pipeline filed under
Closed ("moved to Onboarding"). This backend's `closed_at` specifically
means access-revoked (set only on reject/withdraw/job-close — see
`employer-chat.ts`'s `move_candidate_stage`), never merely "reached a
terminal stage" — a pipeline that's reached Successful/Onboarding still
has `closed_at = null` in real data, so it correctly stays in Active
here. Matching the wireframe's example literally would have meant
inventing a second, UI-only notion of "closed" that doesn't correspond
to anything in the schema.

New `src/home.html`/`src/network.html` — minimal, honestly-labelled
placeholder pages ("Home is coming" / "Network is coming", one card, a
link back to Invites where useful) so the shell's five tab destinations
all resolve instead of leaving two dead links. Real feed/composer/
connections feature work wasn't asked for this sprint and isn't guessed
at here — see `HANDOVER.md` §14's Sprint 19 note for what each still
needs. All five pages registered in `src/index.ts` (`/pipelines`,
`/home`, `/network`).

**Bug caught before shipping, not in production**: both `invites.html`
(from Sprint 18) and the new `pipelines.html` used `data-tab` as the
attribute name for their own in-page pill tabs (New/Accepted/Declined,
Active/Closed) — the same attribute name `nav-shell.html`'s bottom bar
uses for its five nav links. `document.querySelectorAll("[data-tab]")`
in both files' tab-switch handlers would have caught the nav links too,
briefly corrupting `activeTab` state on every nav click (harmless in
practice since the `<a href>` navigates away immediately after, but
still wrong). Caught by re-reading the diff before testing, not by the
click-through itself; fixed by scoping both handlers to `.tabs .tab`
instead of the bare attribute selector.

**Verified**: no new migration or backend route this sprint (pure
frontend), so `tsc --noEmit` + `wrangler deploy --dry-run` (both clean,
1255.52 KiB / 254.67 KiB gzip) covers the build; a full Playwright
click-through against the existing mock-shim harness (extended with
richer fixture data — a new invite with a full `job_snapshot`, an
active mid-stage pipeline, an active Onboarding-stage pipeline, a
candidate-declined-with-reason closed row, an employer-rejected closed
row — and a new `/withdraw` handler the shim didn't have yet) confirmed
zero JS errors and correct rendering across all five pages: the stage
tracker's done/current/upcoming states, the Rejected-only marker, both
closing-note branches, the Invites-tab unread dot lighting correctly
from the same fixture, and the Active/Closed pipeline split correctly
excluding the still-undecided invite. Same branch/PR as Sprints 13–15/
18 (`claude/jobseeker-employer-wireframes-rc5uss`, PR #29 — not yet
merged).

### Sprint 20 — Credentials screen ✅ Shipped 2026-08-31

Continuing the founder's wireframe-order sequencing after Sprint 19.
Screen 07 (Credentials & documents).

**Shipped**: new `src/credentials.html` (`/credentials`), linked from
`dashboard.html`'s badges card rather than added as a sixth tab-bar
item — the wireframe's own sitemap puts Credentials one level under
Profile, not beside Home/Invites/Pipelines/Network/Profile. Three
sections, all against existing routes, no new backend: badges (`GET
/me/badges`, rendering copied verbatim from `dashboard.html` — this
repo's no-build-step convention), DBS (`GET /me/dbs`), sponsorship
status (`GET /me`'s `right_to_work` field, already set at onboarding
step 3 — this section matches the wireframe directly, unlike DBS below).

**Real gap this surfaced, not new**: the wireframe (and `docs/iCare_B2B_
Recruitment_Workflow_Handover.md`, and the Next.js reference's `lib/
types.ts`) specify DBS status as one of three exact strings — "Not Yet
Verified" / "Current — no new information" / "New information
reported" — confirmed by iCare staff via the DBS Update Service.
PROGRESS.md's 2026-08-30 entry already flagged this as unbuilt: no
`state` column exists on `dbs_records` (migration 0001 — only level/
issued_on/on_update_service/consent_to_check/consent_given_at/
certificate_number/workforce), no staff confirmation workflow exists,
and the underlying policy question (DBS guidance wants the *physical*
certificate viewed too — no clean answer for a remote-first platform)
is explicitly flagged for legal input, not decided. Faking the
three-state copy here would mean claiming a confirmation the platform
has never performed. Instead this page shows only real fields: DBS
level, whether the candidate has registered on the Update Service, and
whether they've consented to a future check — the same data
`onboarding.html`'s step 7 already collects. Building the real
three-state flow is its own follow-up, blocked on that policy decision,
not something to fake in this pass — documented in the file's own
header comment as well as here.

**Bug caught before shipping**: the DBS block's two status pills (on
Update Service / consent) were rendered as direct children of a
`display:flex; flex-direction:column` container without `align-items`
set — flex children default to `stretch` on the cross axis, so both
pills stretched to the full card width instead of sizing to their
content, despite being `display:inline-flex` themselves (inline-flex
only controls the element's own internal layout, not how its *parent*
sizes it). Caught in the first screenshot, not the code review pass;
fixed by wrapping both pills in their own `display:flex` row so they
lay out side by side, plus `align-items:flex-start` on the facts
container generally so nothing in it stretches by default going
forward.

**Verified**: no new migration/route this sprint either — `tsc
--noEmit` and `wrangler deploy --dry-run` both clean (1275.66 KiB /
258.28 KiB gzip). Playwright click-through against the mock-shim
harness (extended with a populated DBS fixture and a `right_to_work`
value) confirmed zero JS errors and, after the pill fix, correct
layout — badges render identically to `dashboard.html`, the DBS block
shows real on-file data with both status pills correctly inline, the
sponsorship block shows the right-to-work label. Same branch/PR as
Sprints 13–15/18/19 (`claude/jobseeker-employer-wireframes-rc5uss`, PR
#29 — not yet merged).

### Sprint 21 — Visibility screen ✅ Shipped 2026-08-31

Founder said "Go" after the Sprint 20 handoff, which had offered
Visibility as the next wireframe screen. Screen 08.

**Shipped**: new `src/visibility.html` (`/visibility`), linked from a
new "Visibility" card on `dashboard.html` (grouped near Account, same
"drill-in from Profile" pattern as Credentials). The master "Findable
by employers" switch works both directions and is real, not decorative:
`candidates.is_published` already existed and `/me/publish` (via
`publish_my_profile()`, completeness-gated) already turned it on, but
there was no way back to `false` short of `close_my_account()` — a much
bigger, harder-to-reverse action. New `POST /candidates/me/unpublish`
(`candidates.ts`) is the missing other half: a plain, ungated
toggle-off. Checked first whether this needed a new RLS policy — it
doesn't; `candidate_self` (`for all using (id = auth.uid())`) already
lets a candidate write any column on their own row, `is_published` was
only ever excluded from the generic `PATCH /me`'s application-layer
allow-list (`WRITABLE_FIELDS`) so that turning it on stays behind
`publish_my_profile()`'s completeness gate — the new route doesn't
touch that, it only adds the missing off-switch as its own narrow
endpoint, matching how `/me/publish` and `/me/close-account` are
already separate single-purpose routes rather than folded into the
generic PATCH.

**Deliberately not built**: the wireframe's field-by-field visibility
matrix (About/Experience: Public; Registrations/Availability: Employers
only; Current employer/Documents: Private — each independently
toggleable). Checked `candidate_search`'s actual definition (migration
0001) before assuming this was buildable as a frontend toggle: it's a
single fixed view, no per-field preference exists anywhere in the
schema, and the wireframe's own claim doesn't even hold today —
`about`/`proud_of` are explicitly excluded from that view by the
migration's own comment, contradicting the wireframe's "About you:
Public." Building real per-field visibility would mean new preference
storage plus rewriting `candidate_search` to select conditionally per
row — a genuine backend project, not something to fake with toggles
that silently do nothing. This page instead shows a read-only, accurate
breakdown of what's actually visible and when, sourced from what
`candidate_search`/`candidate_post_search`/the consent-gated media
routes really select.

**Verified against the live schema** — this sprint's new route needed
it, unlike Sprint 20's pure frontend pass: provisioned a test candidate
via the real `handle_new_user()` trigger, manually set `is_published =
true` to simulate an already-published profile (since a fresh test
profile would correctly fail `publish_my_profile()`'s completeness
gate), then ran the exact RLS-scoped update the new route performs —
succeeded, `is_published` flipped to `false`. Confirmed the RLS
boundary itself still holds by attempting the same update against a
different account's id while authenticated as the test candidate — zero
rows affected, as expected from the unchanged `candidate_self` policy.
Test candidate deleted afterward, table confirmed back at 0 leftover
rows. `tsc --noEmit` and `wrangler deploy --dry-run` both clean
(1294.39 KiB / 261.07 KiB gzip). Mock-shim click-through confirmed the
switch renders and toggles correctly both directions, on top of the
schema-level test covering what the harness can't (real RLS
enforcement). Same branch/PR as Sprints 13–15/18/19/20
(`claude/jobseeker-employer-wireframes-rc5uss`, PR #29 — not yet
merged).

### Sprint 22 — Real Home feed (peer visibility) ✅ Shipped 2026-08-31

Founder said "Let's build it now. Start with the home page" after
reviewing what was and wasn't built. Before writing any frontend, checked
whether "a feed of other candidates' posts" (the wireframe's Home,
screen 02) was actually possible against the live schema — it wasn't:
`candidate_posts_self` (migration 0015) is self-read-only, and
`candidate_post_search` (also 0015) is gated on `is_verified_employer()`
— employers only. This exact gap was already flagged in an earlier
session: "Not built: a peer-facing feed — no surface exists for
'visible to other candidates only,' and none was asked for."

**Stopped and asked rather than deciding alone**: exposing candidate
content to a new audience (other candidates, not just consenting
employers) is a real privacy decision, not a frontend judgment call.
Offered two options — Home scoped to just your own content (no new
privacy surface), or add real peer visibility. Founder chose the latter
explicitly, and also correctly pointed out the first option was really
describing Profile, not Home.

**Shipped**: new migration `0026_candidate_peer_feed.sql` — a
`candidate_peer_feed` view, same security-definer-view pattern already
used by `candidate_search`/`candidate_post_search` (flagged by
`get_advisors` as the same pre-existing, accepted class of risk, not a
new one), gated by `current_role_is('candidate')` (existing helper,
`0002_auth.sql`) instead of `is_verified_employer()`. Attribution
columns are deliberately identical to what `candidate_search` already
shows employers pre-consent — headline, primary profession, town — not
a wider disclosure just because the reader changed from employer to
candidate; name/photo/contact stay exactly as hidden as they always
were. New `GET /candidates/feed` (`candidates.ts`) reads it.
`src/home.html` rebuilt from the Sprint 19 "Home is coming" placeholder
into the real page: a pinned "N new invites" strip (same "new" bucket
`invites.html` already defines, outranking the feed per the wireframe's
own stated reasoning), a composer (`POST /me/posts` — already existed,
this is a second entry point matching the wireframe's home-page
composer, not a new capability), a profile-strength bar
(`candidates.completeness`, a real 0-100 int already kept current by a
DB trigger since migration 0003 — not invented for this page), and the
feed itself.

**Verified directly against the live schema**: two test candidates —
one publishes a profile and posts, the other queries `candidate_peer_
feed` through the exact RLS-scoped path `GET /candidates/feed` uses —
correctly saw the post with headline/town/profession attribution, no
name, alongside real pre-existing seed-candidate posts (confirming the
view also picks up genuine content, not just test rows). Negative test:
the same view queried as the existing verified employer test account
returned zero rows, confirming `current_role_is('candidate')` actually
excludes employers rather than just employers-in-practice. Both test
candidates and the test post deleted afterward, all three affected
tables confirmed back at 0. `get_advisors` re-run — one new finding
(`candidate_peer_feed` flagged as a security-definer view), same
class/severity as the two pre-existing ones, not a new category. `tsc
--noEmit` clean, `wrangler deploy --dry-run` bundles cleanly (1305.50
KiB / 263.08 KiB gzip). Mock-shim click-through (feed fixture data +
composer round-trip) confirmed zero JS errors and correct rendering.
Same branch/PR as Sprints 13–15/18–21
(`claude/jobseeker-employer-wireframes-rc5uss`, PR #29 — not yet
merged).

### Sprint 16 — Async video interview stage

Candidate self-schedules, answers pre-set questions on video, submits;
system transcribes + summarises for the recruiter's time only, explicitly
never scored or ranked (extends non-negotiable #5 to video content
specifically). New infrastructure (video capture/storage, transcription)
— needs its own scoping pass on top of this note before it's built.

### Sprint 17 — Candidate dossier UI for employers

Build the employer-facing full-profile screen against
`docs/mockups/candidate-profile-dossier-v2.html`'s three-column layout
(References/Employment history/Qualifications; Descriptive summary/Media/
Posts) and type system (Libre Caslon Text / Courier Prime / Space
Grotesk) — reconciled with the iCare brand system first, per that
mockup's own note. Needs the `employment_history`/`references` new-entity
questions from `HANDOVER.md` §14 resolved first (referee third-party
consent in particular still needs legal input).

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
