# iCare — B2B Recruitment Workflow Handover
**Addendum to HANDOVER.md (candidate side) and iCare_Group_Strategy_Handover.md (brand/pricing)**
Session date: 28 August 2026 · Scope: employer-side search → pipeline → invite → interview flow

This document is standalone-readable but assumes the non-negotiables already
established for the candidate side still apply in full: no charging candidates,
no claiming DBS is verified, no AI scoring/ranking, data minimisation, employer-pays
model under the Employment Agencies Act 1973. Nothing in this session weakens any
of those. If anything, it adds a new one — see §5.

---

## 1. The core workflow, end to end

```
Employer types natural-language prompt
        │
        ▼
System returns a COUNT ("452 matches") + one-line summary
        │
        ▼
Recruiter browses results in a separate card/list view (NOT in chat)
sorted by a neutral, explainable signal — never a ranking
        │
        ▼
Recruiter clicks BOOKMARK on candidates of interest
        │  (private, internal comparison only — no pipeline entry,
        │   no candidate visibility, candidate still fully searchable)
        ▼
Recruiter selects a JOB RECORD (must already exist — see §3)
        │
        ▼
Recruiter clicks SEND INVITE
        │  → candidate enters SHORTLISTED stage of that job's pipeline
        │  → candidate notified: brief description + link to full job description
        │  → candidate now excluded from THIS COMPANY'S future searches
        │    for as long as they're active in THIS job's pipeline
        ▼
Candidate responds: INTERESTED or NOT INTERESTED
        │
        ├─ Not interested → pipeline closed, no further action
        │
        └─ Interested (= consent event)
                │
                ▼
        Employer notified; FULL PROFILE unlocks for this employer,
        scoped to this job's pipeline only (see §5)
        AI profile summary generated ONCE, frozen for pipeline lifetime
                │
                ▼
        Recruiter reviews full profile, decides:
                │
                ├─ Decline → candidate notified politely, pipeline closes,
                │            candidate returns to company's searchable pool
                │            with a visible "previously in pipeline" flag
                │
                └─ Invite to Interview
                        │
                        ▼
                Candidate receives templated message + link
                        │
                        ▼
                Candidate self-schedules async video interview,
                answers pre-set questions one by one, submits
                        │
                        ▼
                System transcribes + summarises for time (NOT scored/ranked)
                        │
                        ▼
                Recruiter reviews transcript/summary + video
                (next pipeline stage TBD — not yet discussed)
```

---

## 2. Search, discovery & the exclusion rule

- **Chat is search-only.** The prompt box returns a match count and a short
  natural-language summary. It never renders scrollable results itself —
  results always hand off to a separate card/list UI. Recruiters should never
  be scrolling through candidates inside the chat panel.
- **Sort order must be neutral and explainable**, e.g. recency of activity,
  location proximity, profile completeness, alphabetical. Never "best fit
  first" — that would be ranking, which is a hard no (existing non-negotiable).
- **Two distinct save actions, not one:**
  - **Bookmark** — private, internal-only, no pipeline entry, zero effect on
    the candidate's searchability. Used for comparing candidates before
    deciding who to actually approach.
  - **Send Invite** — the real commitment. Creates the pipeline entry,
    triggers candidate notification, is the actual consent-request event.
- **Search exclusion is scoped to (company × job), not (company) flatly, and
  only triggers on Send Invite, never on Bookmark.** A candidate can be
  correctly excluded from Job A's search results at Company X while still
  fully appearing in Job B's search results at the same Company X, and while
  still fully appearing in every search run by Company Y. There is no
  cross-company exclusivity anywhere in this model.
- **Rejection is not permanent suppression.** If a recruiter declines a
  candidate (post full-profile-view) or a candidate declines the invite, the
  candidate returns to that company's searchable pool for future jobs, shown
  with a visible history marker (e.g. "Previously shortlisted for [job],
  [outcome], [date]") so recruiters have context without the system making
  the reconsideration decision for them.
- **The one hard, permanent block:** candidate-initiated withdrawal of
  consent / "do not contact me again" from a specific employer. That's the
  only case the system enforces rather than just flags — because it's the
  candidate's decision, not a system judgement about the candidate.

---

## 3. Job module (new — required before any invite can be sent)

**This does not reopen the "no job postings" decision.** Job records are never
public, never browsable, never appear in candidate-facing search, have no
apply button. They exist purely as structured data that an invite pulls from.
The AI natural-language prompt remains the only candidate-facing discovery
mechanism.

**Why it's required, not optional:** a valid consent request has to be
specific and informed (UK GDPR) and has to carry position details before
introduction (Conduct Regulations 2003). Free-texting this into every invite
message would be inconsistent and likely to omit required fields (pay in
particular). **Hard gate: the Send Invite button does not exist/is disabled
until a job record exists for that role.** No fallback for one-off hires —
full transparency was the explicit decision here, to prevent informal
back-and-forth messaging replacing a structured, auditable process.

**Field split — same propose/confirm pattern as the CV parser:**

| AI-drafted (prose, from title + a couple of quick inputs) | Explicit employer input (structured, required) |
|---|---|
| Job description body / narrative | Job title |
| Tone/structure boilerplate | Location |
| — | Pay range |
| — | Hours |
| — | Contract type (permanent/locum/etc.) |
| — | Notice period |
| — | Required qualifications/experience |
| — | Relevant health & safety risks |
| — | **Sponsorship offered — mandatory, three-state (see below)** |

The employer can accept AI-suggested defaults for structured fields (drawn
from similar past roles) but must explicitly confirm them — never silently
auto-filled and sent.

**Sponsorship offered — mandatory field, decided this session.** Not a
binary Yes/No. A flat toggle either hides the transitional-arrangement case
or lets an employer imply new-overseas-hire sponsorship is available when
it isn't. Three states instead:

1. No sponsorship offered
2. Can sponsor an existing Health & Care Worker visa holder switching
   employer only (the transitional arrangement, running to 2028)
3. Can sponsor a new applicant

**Option 3 should only be selectable for job classifications outside Care
Worker and Senior Care Worker** — for those two classifications specifically,
the field should be constrained to options 1 or 2 only, enforced by the
platform rather than left to employer honesty, given the existing
non-negotiable that this route must not be promoted. Exact field copy needs
sign-off from an immigration solicitor before this ships — the three-state
shape is a starting point, not final wording.

**Pipelines are scoped to jobs, not companies.** A company can run multiple
jobs in parallel, each with its own independent pipeline and its own set of
shortlisted candidates. The same candidate can legitimately sit in more than
one pipeline at once for the same company if they're a genuine fit for two
different open roles.

**New/updated data model entities implied:**
- `jobs` (belongs to employer/company; holds the structured + AI-drafted fields above)
- `job_pipelines` or `pipeline_candidates` (join: job × candidate × stage × timestamps)
- `bookmarks` (join: recruiter/company × candidate — private, no stage)
- `invites` (the consent-request record — should snapshot job details as shown
  at time of sending, not just FK to `jobs`, so later edits to pay/hours can't
  retroactively change what a candidate is deemed to have consented to)
- `profile_summaries` (cached AI summary per pipeline entry — see §5)
- `interviews` (async video interview: questions, submitted video refs, transcript, summary)

---

## 4. The consent/invite message contents

Every invite, generated from a confirmed job record, must carry:
- Employer name and service/location (+ CQC/RQIA registration if verifying)
- Job title and type of work
- Location, hours, contract type, notice period
- Pay range and any benefits
- Qualifications/experience required
- Relevant health and safety risks
- What data unlocks if they accept (contact details, photo, any profile media)

Candidate response is binary: **Interested** or **Not interested**. No
partial states. Interested = accept = consent event = full profile unlock
(scoped — see §5) = employer notified.

*(Still open from the original handover: invite expiry window — 14 or 28
days — not yet re-confirmed in this session, carry forward as open.)*

---

## 5. Profile access is scoped and revocable — new non-negotiable

**Decision this session:** full profile access (name, photo, contact
details, any gated media) granted to an employer on candidate acceptance is
**tied to the life of that specific job's pipeline, not permanent.**

When the pipeline closes — candidate rejected, candidate withdraws, or the
job closes — the employer's access to those unlocked fields **revokes**. The
candidate drops back to the standard gated, text-only view for that employer,
identical to any employer who never sent an invite.

This should be added alongside the existing non-negotiables list: **access
grants are pipeline-scoped and expire with the pipeline, never a standing
grant.** This is a meaningfully stronger privacy default than most
competitor ATS products and is worth flagging to an implementing engineer
explicitly, the same way the original non-negotiables doc flags things like
"no AI scoring" — it looks like an ordinary product decision but it's load-bearing.

**Implementation implication:** access checks can't just be "has this
employer ever been granted access to this candidate" — they need to check
"is there a currently-active pipeline between this employer's job and this
candidate." A closed/rejected/withdrawn pipeline must actively revoke, not
just fail to renew.

---

## 6. The AI profile summary shown to the employer

Two **separate, visually distinct** summaries — never blended into one:

1. **Factual summary** — skills, experience, availability, notice period.
   Pulled directly from verified/declared profile data. No interpretation.
2. **Descriptive character summary** — drawn *only* from posts the candidate
   has explicitly consented to share with employers (not their full posting
   history). Must stay strictly descriptive, never evaluative.
   - ✅ "Frequently posts about dementia care best practice; mentors newer
     carers in the comments."
   - ❌ "Comes across as highly dedicated and a strong team player." — this
     is the model forming a judgement about character, not reporting facts.
     Reads as harmless but is evaluative, and evaluative is the thing
     that's banned.

**Generation timing — decided this session:** the entire profile view
(factual data + descriptive summary) generates **once, at the moment the
candidate accepts the invite**, and stays **frozen for the life of that
pipeline** — even if the candidate updates their availability, notice
period, or consented posts while the pipeline is still open. If the same
candidate is later invited to a *different* pipeline (same company or
different one), that's a fresh generation reflecting whatever's current at
that moment.

Rationale: keeps the entire snapshot internally consistent (no
partially-frozen, partially-live fields to reason about) and gives you an
auditable record of exactly what a given employer was shown, for any future
dispute about what was represented to whom.

---

## 7. Profile view UI — "dossier" concept

Two mockup passes exist:

- `candidate-profile-dossier.html` — first pass, two-column, brand-styled
  (purple/teal/paper).
- `candidate-profile-dossier-v2.html` — **current direction.** Redesigned as
  a wide, desktop-first layout (recruiters use this on large monitors, not
  phones — mobile is explicitly not the priority for this screen). Three
  columns instead of two, dense information-per-screen, dark "ops room"
  chrome around warm paper "file" cards. Branding (exact colours/fonts) was
  deliberately set aside for this pass to explore the layout and information
  density properly — needs reconciling with the iCare brand system before
  this becomes a real build target.

**Type system (v2, current):** three deliberately distinct voices rather
than the previous serif/sans/mono default trio, which read as generic.
`Libre Caslon Text` (italic for quotes) is reserved for exactly two things —
the candidate's name and the descriptive-summary quote — as the one
"human voice" moment in an otherwise procedural file. `Courier Prime`, a
genuine typewriter face, carries the paper-sheet body content throughout
(references, employment history, qualifications, posts) — the "typed
report" register. `Space Grotesk` handles all dark-panel system chrome (top
bar, buttons, badge scan readout, tabs, status pills) — the "live console"
wrapped around the paper. The concept: a modern digital system housing an
old-fashioned typed case file, with the person's own name and words as the
one warm departure from both registers.
- **Left column** (sticky): photo inside a "verification scan" ring — the
  four trust badge grades (verified/evidenced/derived/declared) rendered as
  a status-light readout next to the photo rather than as loose pills, plus
  quick facts and a badge-grade legend. This is the one deliberately bold
  element; everything else stays quiet.
- **Middle column**, top to bottom: **References**, **Employment history**,
  **Qualifications**. References are placed first/most prominent by design —
  see below, this was an explicit request to reduce hiring delay.
- **Right column**: Descriptive summary, **Media** (uploaded photos/videos —
  new), **Posts** (consented posts feed).

**Two new profile sections added this session, both new data model needs:**

1. **Employment history** — past employers, roles, and dates, shown as a
   timeline. New entity: `employment_history` (candidate-owned, likely
   self-declared unless/until a verification path is designed — flag for
   badge-grading the same way other profile claims are graded).

2. **References** — candidates can pre-nominate referees so reference
   checks aren't a bottleneck at offer stage. Each referee shown with name,
   role/relationship, and a status (Nominated / Confirmed once they've
   responded). **Important new wrinkle, not yet resolved:** a referee is a
   third party who has not consented to anything on iCare — their name and
   relationship being shown to an employer, and any later contact, raises
   its own UK GDPR question distinct from the candidate's own consent
   framework. The mockup currently withholds the referee's actual contact
   details until a reference request is formally sent, as a placeholder
   safeguard, but **the referee consent model itself needs designing
   properly, not assumed** — carried forward as an open question, §10.

3. **Sponsorship status** — decided this session: rendered as a **badge in
   the trust-grade scan readout**, not a quiet fact row — "Requires
   sponsorship," Declared grade, same treatment as "Available immediately."
   Rationale for showing it plainly: employers on this platform are
   assumed to understand UK sponsorship basics, so this is functional
   information they need, not something to soften or hide. Paired with the
   new mandatory job-side field (§3) — a candidate's stated need and the
   job's stated sponsorship capability now sit on either side of the same
   transaction, both visible, both explicit. If the right-to-work check
   ever surfaces visa conditions directly, this could upgrade from
   Declared to Verified — not built now, but the grade isn't fixed forever.

- Action bar (Invite to Interview / Decline) moved into the sticky top file
  bar in v2, alongside a case-file ID and the frozen/active status stamp,
  rather than a bottom bar — frees vertical space on large screens.

Still a first pass for critique, not a final build.

---

## 8. Interview stage details

- Recruiter clicks **Invite to Interview** only after viewing the full
  profile (separate, deliberate action — not automatic on accept).
- Candidate receives a templated message + link, instructions/reminders
  before starting, self-schedules on their own time (async, no waiting on
  employer availability).
- Candidate answers pre-set questions one by one on video, submits.
- **System parses video for transcription + summarisation only** — purely
  for the recruiter's time efficiency, explicitly **not** scoring or ranking
  interview performance. This extends the existing no-AI-scoring
  non-negotiable to video content, which is worth stating explicitly since
  video is exactly the kind of data that invites an evaluative model by
  default if nobody names the constraint.
- Recruiter can **decline post-interview** too — candidate gets a polite
  notification (exact copy TBC), pipeline closes, candidate returns to
  searchable pool with history flag per §2.

---

## 9. DBS verification — key feature, needs careful boundaries

**Assumption, flag if wrong:** this covers verifying a certificate a
candidate already holds, not iCare helping candidates who don't have one
get one. The latter (sponsoring new Enhanced checks) requires iCare to be
or partner with a DBS "umbrella body" — individuals can't self-apply for
Enhanced checks, the type care roles need — and is a materially bigger,
separate undertaking with its own regulatory footprint. Not in scope here
unless confirmed otherwise.

**Registration flow, decided this session:**
- Candidate provides DBS certificate number + uploads a copy of the
  certificate at registration.
- **Not a blocker** — registration proceeds regardless.
- Status is displayed as **"DBS: Not Yet Verified"** by default, and stays
  that way until a genuine confirmation event occurs (see below) — never
  flips to a positive status just because a number and an image exist.

**What "confirmed" is allowed to mean — this is the load-bearing decision:**
A certificate number plus an uploaded photo does **not** constitute
verification. A scanned image can be altered, and there is no public DBS
lookup a third party can run against a bare certificate number. Treating
upload-plus-number as "confirmed" would breach the existing non-negotiable
that certificates are never claimed as verified.

The only legitimate mechanism is the **DBS Update Service**:
1. Candidate subscribes to the Update Service (must do so within 30 days of
   the certificate's issue date; ~£13/year, free for volunteers) and gives
   explicit consent for status checks.
2. iCare (or, depending on how this is structured, the employer) performs
   an online status check via the Update Service using the certificate
   number.
3. The check returns one of two outcomes, and the badge/status copy must
   say exactly which:

**Exact copy, three states:**

| State | Value shown | Caption shown |
|---|---|---|
| Pending (default) | **Not Yet Verified** | Certificate number and copy on file — pending DBS Update Service confirmation |
| Confirmed | **Current — no new information** | Confirmed via DBS Update Service · checked [date] |
| Flagged | **New information reported** | Reverification required before this candidate can proceed |

Never "DBS Verified," never "clean," never anything implying an absolute
guarantee — "Current — no new information" is the actual, honest limit of
what the check confirms. The flagged state is a distinct, more urgent
outcome, not a variant of "pending" — a new-information result means the
existing certificate can no longer be relied on and should visually read
as urgent (mockup gives it its own red treatment, separate from the amber
pending state), with a clear next action rather than just a status label.

**Unresolved gap, worth a real decision:** DBS's own guidance is that an
online Update Service result alone "is not sufficient" — best practice
expects the checker to have also viewed the *original physical
certificate*, not just a scan, precisely to catch the forgery risk a photo
can't rule out. iCare is remote-first, so this doesn't have a clean answer
yet. Options: (a) treat the online check as sufficient for iCare's own
purposes and be explicit that it's a narrower guarantee than full best
practice, or (b) keep "view of the original" as something the employer
does at interview/first day, with iCare's role limited to the online status
check plus prompting the employer to complete that step. Needs a decision,
not an assumption — recommend legal input given the safeguarding stakes.

**UI treatment, decided this session:** given how safety-relevant this is,
DBS status gets its **own standalone element** on the candidate profile —
not folded into the four-tier trust-grade badge system (Verified/Evidenced/
Derived/Declared) used elsewhere. It should be visually distinct enough
that an employer can't miss it, defaulting to an amber/caution treatment
reading "DBS: Not Yet Verified," upgrading only once an Update Service
check clears, with copy that never overstates what was actually confirmed.
See `candidate-profile-dossier-v2.html` for a first pass.

**Operational question, not yet answered:** does the confirmed-state check
run through an actual Update Service integration, or does it mean staff
manually logging into the gov.uk portal per candidate? The latter has real
staffing/scaling implications once candidate numbers grow — worth costing
out before committing to a manual process as the default.

## 10. Open questions carried forward

- Invite expiry window (14 vs 28 days) — not reconfirmed this session.
- Exact wording for decline notifications (interview stage and
  post-profile-view stage) — deferred, "we can do that later."
- What happens after a successful interview — next pipeline stage(s) not
  yet discussed (Offer? Second interview? Reference checks?).
- Whether/how multiple recruiters at the same company share visibility of
  bookmarks and pipelines (team-level vs individual-recruiter scoping) —
  raised, not resolved.
- Deciding factors for shortlisting (experience match, location,
  availability, right to work, badge trust level, care setting experience,
  salary expectations) — listed as a working draft, flagged to revisit
  properly when finalising which badges/fields act as differentiators.
- **Referee consent model.** Referees haven't agreed to anything by being
  nominated. Need to decide: what a referee is told and when, whether they
  actively opt in before their name is visible to any employer at all
  (rather than just before contact), and how this sits under UK GDPR as
  third-party personal data processed by iCare on the candidate's say-so.
  This wants proper legal input, not an assumed-safe default.
- **Employment history verification.** Currently modelled as self-declared
  like other profile claims — decide whether/how it gets badge-graded
  (e.g. "evidenced" via reference confirmation, "declared" otherwise) rather
  than sitting outside the trust-grade system entirely.
- **Sponsorship field copy and enforcement.** The three-state shape (§3) is
  agreed; exact wording for each state, and the mechanism that actually
  restricts Care Worker/Senior Care Worker jobs to options 1–2 (vs. relying
  on employer honesty), still need building and legal sign-off.
- **DBS verification mechanism.** Manual portal check vs. real Update
  Service integration — not decided. Whether iCare's online check alone is
  sufficient or the employer must still view the original certificate —
  not decided. Exact confirmed-state copy needs legal sign-off. See §9 in
  full.

---

## 11. Read alongside

- `HANDOVER.md` — candidate-side data model, non-negotiables (§1–8), file
  map, conventions.
- `iCare_Group_Strategy_Handover.md` — brand architecture (iCare / iRecruit),
  B2B and B2C pricing.

This document should be merged into a single canonical B2B handover once the
employer-side build actually starts — currently the project is still
candidate-side-first per the existing non-negotiables doc.
