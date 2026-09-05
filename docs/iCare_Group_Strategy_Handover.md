# iCare / Group Strategy — Handover Notes
**Date:** 27 August 2026
**Status:** Strategic notes to be merged into the main HANDOVER.md. These are decisions and open questions from a strategy discussion, not build instructions.

---

## 1. Multi-Vertical Brand Architecture

### Concept
The platform will not stay single-vertical. Each industry vertical gets its own distinct candidate-facing brand (for belonging and engagement), all sharing the same underlying technology. A single unified employer-facing brand sits on top and routes employers to the correct vertical's candidate database.

### Structure
- **iRecruit** — the single B2B/employer-facing brand. One login, one account. During onboarding, employers select their industry, which routes them to the appropriate candidate database/pool.
- **Candidate-facing verticals** (each with distinct branding, own community, own domain):
  - **iCare** — health & social care (current build, near-complete)
  - **iBuilt** — construction
  - **iHost** — hospitality
  - **iFinance** — finance
  - **iTech** / iCode — technology (name still under consideration — "iTech" flagged as generic/overused, "iCode" suggested as more distinctive for technical roles)
  - **iLaw** — legal
  - **iTeach** — education (spans primary, secondary, and university/instructor level — confirmed as a strong pick given the UK teacher shortage)

### Rationale for separate verticals (not one shared platform)
Candidates should feel a sense of belonging to their industry — more likely to engage, post, and spend time on a platform that feels built specifically for their profession, rather than a generic multi-industry job board.

### Domains
**Decision: separate proper domains per vertical**, not subdomains of a parent domain. Branding and sense of identity outweighed the cost/maintenance savings of a subdomain structure (e.g. icare.co.uk, not icare.irecruitgroup.com). Confirmed as manageable from a maintenance standpoint.

### Parent/Holding Company Name
**Open question — unresolved.** Requirement given: should include the word "work." Names explored and rejected as "too shallow" or not landing: Workforge, Workhaven, Vantage Work, Workroot, Workkin, Worklume, Workanchor, Workframe, Workmere, Workspire, Workspan, Workfold, Livelihood, Vocation, Enroute, Foothold, Trove. Parked for a future session — not blocking current build work.

### Correction on file
Monique is based in **England**, not Northern Ireland (this corrects earlier notes/assumptions).

---

## 2. B2C (Candidate-Side) Monetization

### Guiding principle (non-negotiable, legal constraint)
Under the Employment Agencies Act 1973, candidates can never pay for anything that affects their **ranking or visibility in employer searches/outcomes**. This was tested directly against a proposed "£30 for a 30-day profile boost to rank higher in employer AI search" idea — **flagged as high legal risk** and likely non-compliant, since it amounts to paying for improved chances of work-finding. This needs formal legal review before any paid visibility/boost feature is built. Treat as blocked pending advice.

### Approved monetization directions (safe: self-improvement / vanity / content, not ranking)
- CV building tools, portfolio builder (photos/video), custom domain for public profile
- Premium posting/content tools, live features, creator/newsletter monetization
- Upskilling: partnered courses/certifications (also cleanest from a compliance standpoint, genuine candidate benefit)
- **Analytics tier (selected as priority direction — see below)**

### Analytics Tier — Feature Breakdown

**Free tier:**
- Basic profile view count
- Rough trend (views up/down week over week)

**Paid tier:**
1. **Viewer identity** — which companies/recruiters viewed the profile (by name where the recruiter has a public profile)
2. **Search appearance data** — how many times the candidate appeared in an employer's AI search results, even without a click-through (demand signal)
3. **Comparative benchmarking** — profile completeness, badge count, and activity level vs. similar candidates in the same role/region. Framed as an **improvement score, not a live ranking/leaderboard**, to stay clear of the ranking/compliance issue
4. **Skills gap insight** — flags certifications common among similar candidates that this candidate lacks; feeds naturally into the upskilling/training partnership monetization angle
5. **Saved search alerts** — notifies candidate when a new employer search closely matches their profile

### Pricing — B2C Analytics
**Decision: offer both models**
- Monthly subscription: approx. **£5–£10/month** (positioned below LinkedIn Premium's ~£30/month given narrower, single-vertical audience)
- Short-term burst pass: approx. **£4.99 for 7 days**, aimed at candidates actively job-hunting right now

---

## 3. B2B (Employer-Side) Business Model

### Three buyer segments identified
1. **In-house recruitment teams** at companies with their own recruiting function
2. **Recruitment agencies** working multiple roles across multiple clients
3. **Individual headhunters / boutique agencies** wanting a **white-label** version of the platform

### Suggested pricing shape per segment (directional, not finalised)
- **In-house teams:** subscription pricing, likely seat-based or based on number of active searches/roles — classic ATS-style model
- **Agencies:** usage/credit-based pricing that scales with search and shortlisting volume (comparable to Apollo/LinkedIn Recruiter models) — better fit than flat subscription given multi-client workload
- **White-label (headhunters/boutique agencies):** premium tier — likely setup fee + ongoing licence fee, reflecting the additional work to rebrand/white-label the platform

**Not yet mapped:** the detailed day-to-day workflow/journey for each of the three segments through iRecruit. This was explicitly deferred ("let's resume this later") and should be picked up in a follow-up session.

### Major product decision: NO job postings
Explicitly confirmed and locked in: **iRecruit will not have traditional job postings or job descriptions.** This was raised as a gap (it hadn't been considered during the original build scoping) and directly tested against a "lightweight saved search / open role marker" compromise — **the compromise was rejected.**

**Decision rationale:** The platform's stated goal is to be a genuine disruption to the recruitment industry. Traditional job posts + apply flows would contradict the core product idea. The employer's natural-language AI search query *is* the mechanism — there is no formal listing, no application funnel, no job post of any kind. Employers describe who they need in plain language (e.g. "senior carer, 3 years' experience, dementia experience required") and the platform surfaces matching candidates directly for shortlisting.

**Build implication:** No job/vacancy data model, no listings UI, no "apply" flow needed anywhere in the employer-side build. Confirm this is reflected in the employer-side technical scoping when that work begins.

---

## 4. B2B Pricing — Detailed (Follow-up Session)

### 4.1 In-house recruitment teams — FINALISED

**Rejected approaches (with reasoning):**
- Per-seat pricing — rejected. Real-world in-house recruitment teams (e.g. in health/social care) are often just 1–2 people who would simply share a login. Per-seat pricing creates friction and leaves money on the table without reflecting real usage.
- Metering on number of searches — rejected. Search/prompt refinement is core to the product's value (surfacing large qualified pools) and should be unlimited; charging per search punishes normal usage.
- Metering on shortlisting/CV unlocks (paying before seeing candidates) — rejected. Creates a trust barrier — feels like paying for access to CVs "blind," which is a worse experience than free-to-browse competitors like Indeed.
- Module-based tiering (Search-only / Search+ATS / Search+ATS+Analytics as separate paid bundles) — rejected. Recreates the exact fragmentation the product is meant to disrupt. Splitting search from the ATS/pipeline forces a second purchase decision at the moment a customer is most engaged — unnecessary friction.

**Adopted model: single flat tier, volume-gated by concurrent active pipelines (not seats, not search volume, not CV downloads).**
Rationale: concurrent pipelines is the metric that actually correlates with usage load and value extracted, without punishing normal search behaviour or creating an access barrier.

**Final tiers (pricing psychology applied — charm pricing + shrinking gap between tiers to nudge upsell toward the middle/top tier):**

| Tier | Price/month | Concurrent pipelines | Notes |
|---|---|---|---|
| Starter | £99 | 1 | Full feature set (AI search, ATS, video interviews, automated offer notifications) — fits a 1–2 person coordinator team hiring for one role at a time |
| Growth | £169 | 5 | Same full feature set — fits e.g. a domiciliary care provider running senior carer + live-in carer + night shift searches simultaneously. **Recommend visually highlighting this as "Most Popular" on the pricing page (decoy effect).** |
| Scale | £229 | Unlimited | Same full feature set + priority support + analytics/benchmarking layer |

Gap Starter→Growth: £70. Gap Growth→Scale: £60 (intentionally smaller, per pricing psychology, to make Scale feel like the "smart" choice once already at Growth).

All tiers include unlimited AI search and unlimited candidate/shortlist viewing — no caps on searches or CV downloads. The only gated variable is concurrent open pipelines.

Sanity check: current market comparators (Indeed job ad boosting) run circa £300–£500/month for an unqualified applicant flood requiring significant manual screening time. £99–£229/month for a fully screened, AI-matched, pipeline-managed alternative is well positioned against this.

**Note for build/design:** actual pricing page should be built with the psychology above applied (charm pricing, shrinking tier gaps, Growth tier visually emphasised as recommended). Not yet built — flagged for a future agent/session to implement.

---

### 4.2 Recruitment agencies — FINALISED

**Key distinction from in-house teams:** agencies bill their own clients a retainer regardless of whether that client is actively hiring in a given month. Client relationships and their historical data must be retained and stay accessible even during dormant periods. This means the true cost driver for an agency is number of client accounts held, not hiring activity/pipeline volume at any given moment.

**Rejected approach:** pricing per concurrent pipeline only — rejected once the retainer-based reality of agency-client relationships was raised. Would unfairly charge an agency with many small/quiet clients more than one with few very active clients, which doesn't reflect real value delivered.

**Adopted model: tiered by number of client accounts held, with unlimited search and unlimited concurrent pipelines within every tier** (mirrors how agencies themselves get paid — a retainer per client, not per unit of activity).

**Final tiers (validated against market research — see below):**

| Tier | Price/month | Client accounts | Notes |
|---|---|---|---|
| Starter | £249 | Up to 3 | Unlimited users, unlimited search, unlimited concurrent pipelines |
| Growth | £419 | Up to 10 | Same, unlimited everything except client account cap |
| Scale | £549 | Unlimited | Same, unlimited everything |

**Market research conducted (Aug 2026) to validate pricing:** UK recruitment ATS/CRM platforms (Bullhorn, Vincere, ATSpro, etc.) typically price **per user/seat per month**, roughly £40–£200/user, e.g. Bullhorn ~£80/user, Vincere ~£69/user (+~£25 for AI add-ons), ATSpro ~£49/user. A 4-recruiter agency on these platforms already pays roughly £320–£375+/month before any AI features.

**Key differentiator identified:** iRecruit's per-client-account (not per-seat) pricing model is genuinely unusual in this market and is a strong sales angle — agencies can grow their internal headcount without their software bill increasing. This should be a headline point in agency-facing marketing/sales materials.

Sanity check passed: at Growth (£419/mo for up to 10 clients, unlimited users), a 4-person agency already at or above this spend on a seat-based competitor sees no cost increase as they hire more recruiters internally — a meaningful competitive advantage.

**Decision: agency pricing locked in as above.**

---

### 4.3 White label — OPEN / NOT FINALISED

**Target customers discussed:**
- **Near-term focus:** small regional recruitment agencies wanting to appear more sophisticated/tech-forward than a small operation typically would, without building their own tech
- **Longer-term, more ambitious target:** job centres and local councils — genuine mission fit (mandate to place people into work, especially in shortage sectors like care) and real budget, but involves a much slower, heavier public-sector procurement/tender sales motion. Noted as a future opportunity, not a near-term priority.
- Also considered and set aside for now: solo/independent headhunters, sector training providers/membership bodies (e.g. care sector trade associations) offering it as a member benefit.

**Pricing approach explored but not finalised:**
- One-off setup fee of **£1,000–£2,000** — agreed and locked in. Covers custom branding, landing page/colour scheme configuration, onboarding and staff training (training explicitly folded into this one-off fee, not the ongoing monthly cost).
- Ongoing monthly fee — **not agreed, needs further work.** Two approaches discussed:
  1. Base agency tier price (e.g. Growth at £419/mo) + a premium for white-label-specific overhead, itemised as: custom domain/SSL (~£15), branding/theme maintenance (~£25), white-labelled email/notification templates (~£20), extra data/storage for a separate branded instance (~£20), dedicated support time (~£40) — totalling ~£120/month overhead (~29% premium on the £419 base, i.e. ~£539/month all-in). Monique felt this made the base subscription itself (£419) feel too steep for a small agency's first step into white label.
  2. Alternative idea floated (not worked through): remove the separate premium altogether and simply charge the standard agency subscription price for the white-labelled version, with branding treated as a value-add rather than a paid add-on.
- **Decision: parked for now.** Needs a dedicated follow-up session to resolve before this can be finalised or built.

---

## 5. Open Items / Next Session

- [ ] Legal review of any candidate-paid visibility/boost feature (currently blocked/rejected as proposed)
- [ ] Finalise parent/holding company name (must include "work")
- [ ] Decide final name for the tech vertical (iTech vs. iCode vs. other)
- [ ] Map full day-to-day workflow for each of the 3 B2B buyer segments through iRecruit (search/pipeline UX walk-through, not yet done)
- [ ] Resolve UK-wide licensing implications (carried over from original HANDOVER.md, still unresolved)
- [ ] Confirm employer-side technical scoping excludes job/vacancy data model per the "no job postings" decision above
- [ ] **Finalise white label ongoing pricing model** (setup fee of £1,000–£2,000 is agreed; monthly fee structure is not — see 4.3 above)
- [ ] Build actual pricing page for in-house tier applying the pricing psychology notes above (charm pricing, shrinking gaps, Growth highlighted as recommended)

---

*This document should be read alongside the original HANDOVER.md for the iCare candidate-side technical build.*
