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

## Sprint 0 — Foundations for a real (non-waitlist) product surface

Nothing below this works without these first.

- **`/privacy` and `/terms` pages.** Static, server-rendered HTML (same
  pattern as `landing.html`/`employers.html`). Required before any real
  account-creation flow ships (`HANDOVER.md` §8 item 8) — `accounts` has
  a `terms_version`/`terms_accepted_at` pair already waiting to be used.
- **Fix the Supabase "Magic Link" email template** (`{{ .Token }}`,
  Dashboard → Authentication → Emails → Templates). Manual step, not
  scriptable from here. **Note: this does NOT need the parked custom
  domain or Sender.net** — Supabase's own default email sending works
  for OTP codes today; the domain only blocks moving to Sender.net/custom
  SMTP later. This is the one item on the list worth doing even while the
  domain stays parked.
- **UI approach decision (default, flag if you want different):**
  continue the existing pattern for every signed-in page too — self-
  contained server-rendered HTML, text-imported into the Worker, vanilla
  JS calling the JSON API, no build step, no new framework. Consistent
  with the landing pages, keeps the "no build step beyond `wrangler
  deploy`" property. The alternative (e.g. htmx for the multi-step
  wizard) is reasonable but is a real architecture choice — say so before
  Sprint 2 if you'd rather not default into this.
- **A shared client-side auth helper.** New, not yet built: store the
  Supabase access/refresh token (localStorage), attach `Authorization:
  Bearer <token>` to API calls, redirect to sign-in when there's no
  session. Every signed-in page from Sprint 1 onward depends on this
  existing once, not being reinvented per page.

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

### Sprint 8 — Compliant candidate search (written-first)

The sprint non-negotiable #4 governs directly — this is not a normal
listing page.

- Search over **published** candidates by structured fields (profession,
  skills, location/travel radius, availability). **Not** free-text/AI
  search — that's explicitly phase 2 (§9) and needs the protected-
  characteristics guardrail designed first (non-negotiable #5), not
  just prompted around.
- Results **must exclude photo, name, video, and CV file** — show only
  the written case (headline, about, skills, qualifications summary,
  badges) until shortlist + candidate consent. This is the whole point
  of the sprint, not an afterthought.

### Sprint 9 — Shortlisting + consent unlock

- `POST /shortlists` (employer shortlists a candidate) — **new route**,
  table already exists.
- Candidate-side: see incoming shortlists, consent to unlock (sets
  `shortlists.candidate_consented_at`).
- Once consented: employer can see photo/name/video/CV. Full contact
  details and the DBS certificate number stay separately gated (they're
  Reg 22 territory, non-negotiable #7 — confirm identity, qualifications,
  and two references before an actual placement, not just on shortlist).

### Sprint 10 — Employer dashboard

View shortlists and their status, org profile/verification status, basic
account settings.

**→ Employer track complete here.** A verified employer can search
compliantly, shortlist, and (with candidate consent) see enough to make
contact.

---

## Explicitly not scheduled above (known, deliberately deferred)

- **Admin review tooling** for qualifications/registrations/employer
  verification — every sprint above that lands something in `submitted`/
  `under_review` assumes manual review via the Supabase dashboard until
  volume justifies building this. Worth a dedicated sprint once real
  users exist.
- **Self-expression posts + employer conversational AI search** — §9,
  explicitly phase 2 per the product brief. Needs the per-post consent
  model and the protected-characteristics guardrail designed properly,
  not bolted on.
- **Anything needing real outbound email** (reference-response emails,
  the waitlist welcome email, Sender.net integration itself) — blocked
  on the parked custom-domain work. Flag it when picked back up rather
  than silently working around it.
- **Two-factor auth for employers** — deferred per `HANDOVER.md` §12
  until real shortlists exist.
