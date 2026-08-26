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

### Sprint 1 — Candidate sign-up / sign-in UI

A real candidate can create an account and land somewhere.

- Sign-up screen: name + email → `POST /auth/request-code`
  (`create: true, role: "candidate"`) — **route already exists.**
- Verify-code screen: 6-digit code → `POST /auth/verify-code` — **route
  already exists.** Store the returned session via Sprint 0's auth helper.
- Sign-in screen for returning candidates (`create: false`).
- On success: redirect to the onboarding wizard if
  `candidates.onboarding_done = false`, else to the candidate home
  (Sprint 5). No DB changes needed — `handle_new_user()` already creates
  the `candidates` row on signup.

### Sprint 2 — Onboarding wizard shell + core profile

The wizard framework itself, plus the first real steps.

- **New routes needed:** `POST /candidates/me/onboarding/advance`
  (bumps `candidates.onboarding_step`, inserts a row into
  `onboarding_events`), `POST /candidates/me/onboarding/complete` (sets
  `onboarding_done = true`).
- Wizard UI shell: step indicator, back/next, resumes from
  `candidates.onboarding_step` on reload (not a fresh start every visit).
- **Step — Basics:** headline, about, town, postcode_district
  (outward-district only, per non-negotiable #6), primary + additional
  professions. Uses the **existing** `PATCH /candidates/me` and
  `PUT /candidates/me/professions`.
- **Step — Skills:** clinical skills picker. Uses the **existing**
  `PUT /candidates/me/skills`.
- **Step — Availability & logistics:** availability state, shift
  preferences, travel radius, right-to-work status, driving
  licence/vehicle. Uses the **existing** `PATCH /candidates/me`. Copy
  care: no sponsorship implication for *care worker*/*senior care
  worker* roles specifically (non-negotiable #8 — overseas recruitment
  for those two closed 22 Jul 2025).

### Sprint 3 — Work history, qualifications, registrations

The evidence that actually backs a profile.

- **Step — Employment history:** full CRUD, **existing** API
  (`/candidates/me/employment-history`), new wizard UI for add/edit/
  reorder.
- **Step — Qualifications:** **new routes needed** for `qualifications`
  (create/list/delete, evidence file upload to R2, `status` starts
  `submitted`). Schema/RLS already exist, no Worker routes yet.
- **Step — Registrations:** **new routes needed** for `registrations`
  (regulator enum + reg number, `status` starts `submitted`). Schema/RLS
  already exist, no Worker routes yet.
- Both qualifications and registrations land in `submitted`/
  `under_review` with no reviewer UI yet — review happens manually via
  the Supabase dashboard for now. An admin review tool is real scope,
  deliberately not in this sprint (see "Explicitly not scheduled" below).

### Sprint 4 — DBS, references, self-expression prompts

The compliance-sensitive steps — written carefully, not fast.

- **Step — DBS status + consent:** **new routes needed** for
  `dbs_records` (level, `on_update_service`, `consent_to_check` +
  `consent_given_at`). Copy must say *"Enhanced DBS · on Update
  Service"* — never "verified/certified/checked" (non-negotiable #3).
  `certificate_number` is captured but never exposed pre-shortlist.
- **Step — References:** **new routes needed** for `candidate_references`
  (referee name/org/email/relationship). Reg 22 (non-negotiable #7)
  requires two references confirmed *before a placement*, not
  necessarily before publish — this sprint collects referee details;
  the actual referee-response flow (`candidate_references.token`,
  outbound email to the referee) is deferred to a later sprint since it
  needs real outbound email, which is blocked on the same parked
  domain/Sender.net work. Flag this dependency when it's picked up.
- **Step — Prompts:** **new routes needed** for `candidate_prompts`
  (short free-text answers to the `prompts` reference table) — this is
  the "your own voice" positioning from the landing page copy, made real.

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
