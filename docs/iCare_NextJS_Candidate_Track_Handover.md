# iCare — Handover

*Last updated: current session. This supersedes any earlier handover doc.*

---

## 1. What iCare is

A UK healthcare professional network and recruitment platform, built from a Northern Ireland base for a UK-wide market. Two separate products on two separate domains:

- **icareltd.com** — candidate/jobseeker-facing profile and community product
- **iRecruit** — employer and agency-facing recruitment tool (confirmed name)

**Model:** consent-first. Employers search redacted candidate profiles and send role-specific invites. Candidates control what's shown, and identity (name, photo, contact details) is never revealed to an employer until the candidate accepts an invite tied to a specific job.

**Commercial split:** employer-pays, candidate-never-pays — a hard legal constraint under the Employment Agencies Act 1973. All pricing, plans, and billing language lives exclusively on iRecruit. Nothing about cost appears anywhere on icareltd.com, including the landing page.

**Workforce covered:** the full UK healthcare workforce — nursing, medicine, allied health professionals, care and support workers, healthcare scientists, and practice/admin teams. Not carer-specific; all copy and product decisions treat this as a general healthcare professional network, closer to LinkedIn than a single-vertical job board.

---

## 2. Current build state

### Marketing site (icareltd.com landing page)
- Combined single-page landing built in the "Invite" visual direction (purple `#330072` / teal `#00A499` / lavender paper), using headline "One profile. Every healthcare employer looking for you."
- All payment/pricing language removed and confirmed absent.
- File: `landing-page.html`

### Candidate-side product (icareltd.com) — wireframes
Full sitemap plus nine screens, greyscale, in `jobseeker-wireframes.html`:
00 Sitemap · 01 Onboarding · 02 Home · 03 Invites · 04 Invite detail (incl. decline flow) · 05 My Pipelines · 06 Profile · 07 Credentials · 08 Visibility · 09 Network

Every open question raised during wireframing has been annotated in place and resolved or explicitly flagged (see Section 4).

### Candidate-side product — real code
Next.js App Router + Tailwind, in `icare-jobseeker-app-code.zip`. Structure:

```
lib/types.ts                          — compliance-locked shared types
components/profile/                   — Badge, CredentialRow, IdentityCard, PreviewToggle, ProfileView, sections
components/invites/                   — InviteListItem, InviteDetail, DeclineFlow
components/pipelines/                 — PipelineListItem
components/home/                      — HomeSections, HomeFeed, PostComposer
components/credentials/               — CredentialsSections (incl. editable DBS card)
components/settings/                  — VisibilitySections (master switch + per-field control)
components/network/                   — NetworkSections (flagged as likely phase-2 cut)
components/shared/                    — Pill, EmptyState
app/profile/page.tsx
app/invites/page.tsx, app/invites/[id]/page.tsx
app/pipelines/page.tsx
app/home/page.tsx
app/credentials/page.tsx
app/settings/visibility/page.tsx
app/network/page.tsx
app/onboarding/page.tsx               — step 3 built in full, steps 1/2/4-7 are placeholders
tailwind.config.snippet.ts            — brand tokens as named utilities
```

All screens run on inline mock data with comments marking where a Supabase fetch replaces it. **No Supabase wiring exists yet** — schema not yet defined.

**Compliance enforced structurally, not just by convention:**
- `lib/types.ts` hardcodes the three permitted DBS strings (`Not Yet Verified` / `Current — no new information` / `New information reported`) as the only source of truth — impossible to accidentally render "Verified" or "clean" against DBS.
- The five always-hidden-pre-acceptance fields (name, photo, phone/email, exact address, current employer name) are a fixed exported constant, not a user-configurable list.
- `DECLINE_REASONS` is a fixed union type, identical for every profession.

**Recently fixed:** Home previously had no way to create a post on mobile (composer only existed on desktop in the wireframe, and didn't exist at all in code). Fixed in both — mobile now has a tappable "Share an update…" prompt that expands into a full composer (`PostComposer.tsx`), wired into a new `HomeFeed.tsx` client component that owns composer state and prepends new posts.

### Employer-side product (iRecruit) — wireframes only, no code yet
Full sitemap plus eight/nine screens in `employer-wireframes.html`:
00 Sitemap · 01 Home (dashboard, own module) · 01b Chat (own tab) · 02 Post a job · 03 Search candidates · 04 Candidate preview · 05 Send invite · 06 Job pipeline (kanban) · 07 Bookmarks · 08 Team & billing

**Home/Chat structure (locked this session):**
- **01 Home** is dashboard-only: open roles, invites awaiting, active pipelines, bookmarked count, pipeline breakdown by the six stage names, "needs a decision" panel. No chat embedded.
- **01b Chat** is its own nav tab, full-height, same pattern as ChatGPT/Claude — a nested conversation-history sidebar ("+ New chat" plus named past threads) alongside the transcript.
- **Chat is a hand-off layer, never a rendering surface.** It never displays a candidate list, pipeline board, or form inline — every substantive answer ends in a link to the real screen (Search, Pipelines, Jobs) with filters/context pre-applied. This is what keeps the no-ranking rule enforceable: exactly one place candidate results are ever displayed.
- Chat has memory: recalls prior search criteria within and across sessions, and can proactively suggest based on the recruiter's own repeated behaviour (never inferred about a candidate). **Decided: memory is shared across an organisation's team seats**, not per-recruiter.
- Ambiguous searches and ambiguous commands (e.g. "waiting for a job offer" doesn't map to one of the six stage names) get a clarifying question with chip options, never a guess.

Employer-side wireframes are **not yet built as code.**

---

## 3. Decisions log (locked)

### Compliance non-negotiables (unchanged from project start)
- No charging candidates in any form
- DBS: three permitted states only, never "Verified"/"clean"; **DBS status is a manual staff-portal check, done by iCare directly — not a live Update Service API integration**
- **Referee/reference checks are conducted by iCare directly.** Referees are optional — candidates are never required to supply one. If supplied and confirmed, the associated experience entry can show as Verified; this is a differentiator employers may prefer, never a requirement.
- No AI scoring or ranking of candidates anywhere — including inside iRecruit's chat. Search sorts only by plain, explainable attributes (distance, availability, registration, years of experience).
- Sponsorship fields disable for Care Worker/Senior Care Worker roles (July 2025 restriction), enforced at point of job creation on iRecruit.
- **New this session: candidates declare their own sponsorship need** at registration (onboarding step 1) and can change it any time from the Credentials screen (e.g. moving to part-time once sponsored elsewhere). This is a separate field from the employer's job-level sponsorship offer — one states need, the other states what's available for that role. The matching logic between the two is not yet specified.
- Search results are redacted by construction (the underlying record has no name/photo/contact field populated for an employer pre-acceptance) — not a display-layer filter.

### Consent and pipeline mechanics
- Invites expire after **7 days**; **on expiry, the employer is notified.**
- **Decline is always disclosed to the employer, with a reason from a fixed six-option list**, identical across all professions: *Not looking for work at the moment / Not available for this pattern / Too far to travel / Not the right role for me right now / Already accepted another offer / Prefer not to say.* The reason appears **verbatim on the invite record** on the employer side — not aggregated.
- "Prefer not to say" is recorded internally, never shown to employers. **After 5 consecutive uses, the candidate gets a gentle nudge and an option to turn off discoverability entirely** — not a penalty, not surfaced to any employer.
- Six pipeline stages, identical on both candidate and employer sides: **Shortlisted → Invited for Interview → Pending Interview Result → Successful / Rejected → Onboarding.** Mechanics behind each stage (what triggers it, sub-steps) remain deferred for later fine-tuning.
- Rejection is shown plainly to the candidate ("Rejected"), never hidden, with the access-revocation line stated underneath. Moving a card to Rejected on the iRecruit kanban must actually revoke access, not just relabel a column.
- Access to full candidate profile is scoped exclusively to that job's pipeline and revokes automatically when the pipeline closes.
- **No per-employer blocking.** Decided out of scope — appearing in a search costs nothing on its own since full identity is never shared without an accepted invite, so there's nothing left for blocking to protect against.
- **No promotion pipeline for employment history badges.** Each entry keeps whatever grade it naturally earns (Derived/Declared/Evidenced); verifying every job a candidate has held doesn't scale. Referee verification (above) is the one path to Verified, and it's opt-in.
- 400 existing contacts are invited to create their own accounts, not bulk-imported.
- **"Public" on the visibility screen means other iCare members only — never the open indexed web.** Should be stated plainly on the screen itself.

### Naming / structure
- **iRecruit is the confirmed name** for the employer/recruiter domain.
- Onboarding prioritises steps 1–3 so partial completions still produce a findable profile.
- CV parser proposes, candidate confirms — no auto-applying parsed data.
- Four-grade badge trust system: verified / evidenced / derived / declared.

---

## 4. Open items — genuinely unresolved, not yet designed or decided

1. **Candidate preview / employer preview parity** — confirmed as a hard requirement (must render identically, field for field) but not yet build-verified since both sides aren't code yet. Ideally generated from one shared redaction rule rather than built twice.
2. **Sponsorship copy legal sign-off** — the exact wording of the three sponsorship states needs review by an immigration/employment lawyer before launch. Action item, not a design question.
3. **Northern Ireland / UK-wide licensing implications** — flagged at project start, still not addressed.
4. **Sponsorship matching logic** — how a candidate's declared sponsorship need relates to an employer's job-level sponsorship offer during search/invite. Not specified.
5. **Post visibility** — the new composer has no visibility control at the point of posting. Does a post inherit the candidate's general profile visibility setting, or need its own public/connections-only choice?
6. **Chat conversation history persistence details** — confirmed shared across team seats, but UI for showing *which* teammate asked what inside a shared thread isn't designed.
7. **iRecruit ambiguous-command handling default** — does chat always ask a clarifying question, or sometimes resolve to a best-guess with room to refine? Current wireframe always clarifies; not stress-tested against real usage patterns.
8. **Network (candidate-side)** — explicitly flagged as the most likely phase-2 cut. Built to spec in code but deliberately not expanded further.
9. **Onboarding steps 1, 2, 4, 5, 6, 7** — only step 3 (Experience) is fully designed and coded. The rest are placeholders.
10. **iRecruit — no code built yet**, wireframes only.
11. **Supabase schema** — not defined. All current code runs on inline mock data.

---

## 5. Tools & stack

- **Frontend:** Next.js App Router, Tailwind CSS (brand tokens as named utilities — see `tailwind.config.snippet.ts`)
- **Backend/DB:** Supabase (Edge Functions for CV parsing) — not yet wired to any screen
- **AI integration:** Anthropic API (CV parsing)
- **Email platform:** Sender.net via MCP tools; verified sending domain icareltd.com, from-address info@icareltd.com
- **Type system for employer dossier (iRecruit, planned):** Libre Caslon Text / Courier Prime / Space Grotesk
- **Candidate-side brand system:** Fraunces (serif), Public Sans (body), IBM Plex Mono (chrome/mono), purple `#330072`, teal `#00A499`, lavender `#F4F1F8`

---

## 6. Suggested next steps

1. Resolve the highest-leverage open item: **Supabase schema**, since every screen is currently mock data and nothing can move past wireframe-fidelity without it.
2. Decide **post visibility** (#5 above) before the composer ships, since it's a small decision now and a harder retrofit later.
3. Begin **iRecruit code build**, following the same pattern established on the candidate side (server page + client component split, compliance rules encoded in shared types).
4. Schedule the **sponsorship copy legal review** (#2) — it's outside Claude's or the design process's ability to resolve and has a hard external dependency.
5. Revisit **onboarding steps 1–2 and 4–7** now that sponsorship declaration (step 1) and registrations (step 5) have new content to design against.
