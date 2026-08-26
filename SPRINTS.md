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

### Sprint 5 — Photo, review, publish, candidate home

Close the loop: zero to a real published profile.

- **Step — Photo:** **existing** `POST /candidates/me/photo`.
- **Review step:** summary of everything entered, completeness indicator
  (`candidates.completeness` — already computed by a DB trigger).
- **Publish:** **existing** `POST /candidates/me/publish` RPC.
- **Candidate home/dashboard:** view + edit the published profile, see
  own badges (`candidate_badges`, read-only — `verified`/`evidenced`/
  `derived`/`declared` must stay visually distinct per non-negotiable
  #2), basic account settings (close account via the **existing**
  `close_my_account()` RPC).

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

### Sprint 6 — Employer sign-up / sign-in UI

Mirrors Sprint 1 for `role: "employer"`, collecting `org_name` at
signup. Same **existing** `/auth/*` routes, same Sprint 0 auth helper.

### Sprint 7 — Employer verification flow

- **New routes needed** for `employer_verification_requests` (submit
  CQC provider ID / Companies House number / org email — see
  `HANDOVER.md` §12 on what "verified employer" should require; CQC
  provider ID is the strongest signal available, email-domain match the
  weakest).
- UI: a verification form + a "pending verification" gate — no candidate
  search until `employers.is_verified = true` (checked via the
  **existing** `is_verified_employer()` RPC).
- Review is manual (Supabase dashboard) for now, same reasoning as
  Sprint 3's qualifications/registrations — no admin UI in this sprint.

### Sprint 8 — Chat infrastructure + candidate search

The foundation everything else in this track sits on.

- **New: LLM tool-calling loop on the Worker** (Anthropic API — needs an
  `ANTHROPIC_API_KEY` secret, `wrangler secret put`, never a plain
  `wrangler.jsonc` var). The model's job is narrow: translate the
  employer's natural-language message into a structured tool call. It
  never sees or judges candidate data directly — that keeps non-
  negotiable #5 enforceable by construction, not just by prompting.
- **New: protected-characteristics guardrail**, checked on every
  employer message *before* it can inform a search — reject/redirect
  queries referencing sex, age, race, religion, disability, or the other
  protected characteristics (Equality Act 2010), rather than silently
  passing them to the search tool. This needs a real check (keyword +
  classifier), not just a system-prompt instruction, per non-negotiable
  #5's explicit requirement. Nothing about the name/title/location
  override above touches this guardrail — it stays in full force.
- **New tool — `search_candidates`**: natural language → structured
  filters (profession, skills, location/travel radius, availability) →
  a deterministic query against **published** candidates. No ranking, no
  scoring — the model only produces filter parameters, the database does
  the (non-evaluative) matching.
- **Chat UI**: single input + message thread, the employer's home after
  sign-in (per the chat-first decision above).
- **Result fields — per the founder override above**: candidate's name
  (`accounts.full_name`, joined via `candidates.id = accounts.id`),
  current job title (`employment_history` row where `is_current = true`,
  its `job_title`), and location (`candidates.town`/
  `postcode_district`). Plus role/badges/experience summary/skills as
  before. **Photo, video, and CV file stay excluded pre-shortlist** —
  the override didn't touch those.

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
- **Candidate self-expression posts** — §9, explicitly phase 2 per the
  product brief. Needs the per-post consent model designed properly, not
  bolted on. (Employer conversational search itself is now scheduled —
  Sprint 8 — but Sprint 10's "Who is X" summary deliberately doesn't
  depend on posts existing; see that sprint's note.)
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
