# Handover: Sponsored jobs & daily news — remaining build (Phases 2–5)

Written 15 Oct 2026, for the next agent picking up this work. Phase 1
(Sponsor check) is **live**. This document covers everything left.

## 0. Read first, in this order

1. `HANDOVER.md` — the whole thing, but especially §1 (non-negotiables),
   §2 (stack), §10 (conventions), §11 (gotchas) and **§25** (this feature,
   founder decisions of 14 Oct, what Phase 1 shipped).
2. `PROGRESS.md` — last ~3 entries.
3. The original founder spec: "iCare: Sponsor Check, UK Sponsored Jobs &
   Daily News — Build Handover" (14 Oct 2026). It isn't in the repo — ask
   the founder (Monique) to upload it to your session if you need the
   full text. Everything below reconciles that spec with this repo; where
   they differ, **this document and HANDOVER.md §25 win**, because the
   spec was written for a different stack.

Update `PROGRESS.md` (and `HANDOVER.md` §25 when something a fresh agent
needs changes) before ending every session — `AGENTS.md` requires it.

## 1. The stack is NOT what the spec assumes

The spec says Next.js App Router + Supabase edge functions. The real,
live site is:

- **One Cloudflare Worker** (`src/index.ts`, Hono router), TypeScript, no
  frontend framework, no build step. Each page is a self-contained
  `src/*.html` file imported as text and served with `c.html()`.
- **Supabase** project `care-register` (id `blflbiwqflidltqflwew`) —
  iCare's real backend. Never touch `Meridian Project` or
  `rah-caregiver-portal`.
- **Scheduled jobs** = GitHub Actions (`.github/workflows/*.yml`) or the
  Worker's Cloudflare cron. Not Supabase edge functions.
- **Secrets** = Cloudflare Worker secrets (dashboard) or GitHub Actions
  secrets. Never in the repo, `wrangler.jsonc`, pages or logs.
- **AI** = Cloudflare Workers AI only. **Founder decision 14 Oct: no paid
  LLM API (no Anthropic API) for news.** Build no-cost automation.
- Deploy = push/merge to `main` → `.github/workflows/deploy.yml`.

Do not scaffold a second (Next.js) app. That mistake is documented in
HANDOVER §14/§23.

## 2. Founder decisions already made (don't re-ask)

- **Job board is in** — UK *sponsored* health & care jobs only; on-site
  apply; applications go to the admin (Monique) for now. This overrides
  the old "no job postings ever" rule (HANDOVER §12/§14 carry the note).
- **Sign-in required** for Sponsor check, Jobs and the News feed. Public
  blog/news articles stay public for SEO.
- **Usable straight after sign-up** — Sponsor check and News must not
  require finishing the 11-step onboarding.
- **Navigation:** Sponsor check, Jobs and News each get their own tab;
  **Jobs and News also appear inside Rounds** (`/rounds`, the Home feed).
  **Pipelines tab is hidden** (page still works).
- **Paid tiers:** code tier-ready, but put nothing behind payment.
  Candidates are never charged for anything (HANDOVER §1 #1 — Employment
  Agencies Act 1973).
- **News drafting must cost nothing.**

## 3. Ask the founder before building these (still open)

| # | Question | Blocks |
|---|---|---|
| 1 | **News pipeline shape.** Recommended: publish news through the existing `/blog` (Markdown in `content/posts/`, approval = founder merges a GitHub PR — `scripts/daily-news-draft.js` already does this) rather than the spec's Supabase admin queue (needs an admin role + admin screens that don't exist). Never answered. | Phase 2 |
| 2 | **Design canvas link** — the spec's "iCare Design canvas" (screens for sign-up, Home feed, Sponsor check, Jobs, Job detail, News article). Never received. Build from existing pages' style if it doesn't come. | UI work |
| 3 | **Sectors** — health & social care only? (spec's assumption) | Phase 3 |
| 4 | **Reed API key + Adzuna app ID/key** — founder registers (free); keys go in GitHub Actions secrets. Never in chat. | Phase 3 |
| 5 | Where admin notifications go (email address and/or Slack). | Phase 2/4 |
| 6 | Who approves news (default Monique). | Phase 2 |
| 7 | Sender.net group for the weekly member digest. | Phase 2 |
| 8 | Solicitor sign-off on the "not immigration advice" wording. | Launch |

## 4. Phase 1 — done, what remains to watch

Live: `https://icareltd.com/sponsor-check` (PRs genesysc/icare#59, #60).
Built: migrations `0052`/`0053` (both applied), `src/sponsors.ts`,
`src/sponsor-check.html`, `scripts/refresh-sponsor-register.js`,
`.github/workflows/sponsor-register-refresh.yml`, Sponsors tab on every
signed-in page, `?next=` support in `sign-in.html`/`verify.html`.
Register loaded 14 Oct: 122,031 A-rated Skilled Worker sponsors;
all spec acceptance checks for the matcher passed.

**⚠️ The daily refresh is NOT working yet. Finish this first (Phase 1.5):**

Found 15 Oct: the 06:20 UTC schedule didn't fire, and a manual run failed.
Two separate problems:

1. **GitHub secret mismatch.** The Action fails with `unauthorized`:
   the GitHub Actions secret `SPONSOR_REFRESH_SECRET` doesn't equal
   `app_secrets.sponsor_refresh_secret` in the database. Founder fix:
   in the Supabase SQL editor run
   `select value from app_secrets where key = 'sponsor_refresh_secret';`
   and paste the value **exactly** (no spaces or newline) into GitHub →
   Settings → Secrets and variables → Actions → `SPONSOR_REFRESH_SECRET`.
2. **The check step times out** now that 122k sponsors are loaded
   (~3.7s against anon's 3s limit). Fixed in
   `supabase/migrations/20261015090000_0054_sponsor_refresh_fast_steps.sql`
   + the matching `scripts/refresh-sponsor-register.js` change (load
   de-duplicates; the expected count is the sum of load results). **0054
   is NOT applied yet** — it contains TRUNCATE/DROP, so the founder must
   paste it into the SQL editor (or approve it when you apply it via MCP).
   The script and the SQL must ship together: the old script's
   expected-row count won't match the new de-duplicating load.

After both: merge the PR carrying 0054 + the script, run "Sponsor
register refresh" by hand (Actions → Run workflow), and confirm a
`complete` row for today in `register_runs`. Time each step — every call
must stay well under 3s; if `complete` or `check` creeps close, look at
the plans with `explain analyze` as the postgres role. The live data is
the 14 Oct register until this works (still valid, just a day old).

Also still to do: **a signed-in browser test** of the search (no test
account was available) — ask the founder to try it, or for a test login.

## 5. Phase 2 — Daily news (build next)

Goal (spec §8): 1–3 original iCare posts a day, a News tab, news cards in
Rounds, weekly digest. iCare writes its own words; never republishes
others' text; at most one short quote per source; no source images.

**What already exists — extend it, don't replace it:**
- `/blog` — 13 posts, Markdown in `content/posts/`, compiled by
  `npm run build:blog` into the committed `src/blog-content.ts`; SEO,
  JSON-LD, RSS, sitemap all done (HANDOVER §15, §23).
- `scripts/daily-news-draft.js` + `.github/workflows/daily-news-draft.yml`
  — drafts posts with Workers AI and opens a PR for approval. **Has never
  produced a mergeable draft** (HANDOVER §24 — timeouts, Google News
  rate limits). Debug it somewhere low-stakes, not by repeatedly running
  the production workflow.
- Rounds news sidebar — `news_items` table (migration 0048), `src/news.ts`
  (mounted at **`/news` — this path is taken**), `src/news-ingest.ts`
  (2-hourly Cloudflare cron, newsdata.io). **Hidden on the live site**
  since 24 Sep (`<aside class="news-col" hidden>` in `src/rounds.html`)
  because ingestion was unreliable (HANDOVER §22/§24). Re-enabling is a
  two-line revert once ingestion is proven.

**Recommended no-cost automations, in priority order:**
1. **Register watch** (no AI at all) — weekly "new / removed health &
   care sponsors" built from `sponsors.first_seen_date`,
   `sponsors.removed_date` and `register_runs`. iCare-only content. Note:
   the 14 Oct load set every row's `first_seen_date` to 2026-10-14, so
   only count dates after that. Health/care filtering needs a heuristic
   (name keywords: care, health, NHS, nursing, medical, pharmacy, dental,
   hospice, clinic…) — label it as such.
2. **Rule-alert cards** — GOV.UK Atom feeds (e.g.
   `https://www.gov.uk/search/news-and-communications.atom?organisations[]=uk-visas-and-immigration`,
   Home Office, DHSC). Headline + link + date to the primary source, shown
   in the News tab and pinned in Rounds for 7 days. No rewriting needed.
3. **Drafted articles** via Workers AI (free daily allowance) through the
   existing PR-approval flow, once `daily-news-draft.js` is reliable.
   Structure per spec: "What changed / Who it affects / What to do next",
   Tier 1 source first. Rule-change posts may not publish without a
   Tier 1 (official) link.
4. **Jobs roundup** (Phase 3 dependency) — templated from job data.

**Every post / card:** footer "General information, not immigration
advice. Check gov.uk or a regulated adviser for your situation."; date-
stamp every changeable fact; never "Verified"/"clean" in DBS contexts;
never "candidates never pay" framing; nothing auto-publishes.

**UI:** a News tab page (choose a path that isn't `/news` — e.g.
`/news-feed` page, or move the existing API; decide and document), plus
cards inside Rounds. Feed order = recency + pinning only; members' roles/
regions/topics drive tags, **never a score about the person** (HANDOVER
§1 #5).

**Weekly digest:** Sender.net (`src/email.ts` pattern; automated mail is
always from `hello@icareltd.com`, never `info@` — HANDOVER §2). Only to
members with a lawful basis; unsubscribe link in every send.

## 6. Phase 3 — Sponsored jobs board

Pipeline as a GitHub Action (same pattern as the sponsor refresh: shared
secret + SECURITY DEFINER RPCs, no service_role key):
1. Pull Reed ("Health & Medicine", "Social Care") and Adzuna
   (`healthcare-nursing-jobs`, `social-work-jobs`), UK only.
2. Match employer + town with the existing **`match_sponsor(name, town)`**
   (migration 0052): `exact` → keep; `name_only` → status `review`, not
   shown; `none` → **drop, never shown**. No fuzzy auto-matching.
3. Role check (verify every rule on gov.uk / Appendix Skilled
   Occupations before launch — they change):
   - graduate level (RQF 6+) and on the eligible list;
   - salary ≥ £41,700 or the occupation's going rate, whichever is
     higher (lower thresholds exist for some health/care roles, new
     entrants, Immigration Salary List);
   - missing salary or SOC code → fails the role check (don't guess);
   - **care worker (SOC 6135) / senior care worker (6136): tag "UK-based
     switchers only", never "new applicant" sponsorship** (closed to new
     overseas applicants since 22 Jul 2025; switching until 22 Jul 2028 —
     HANDOVER §1 #8).
4. Upsert, close expired, re-check badges against the latest register
   every run; badges expire automatically.
5. "Jobs by Adzuna" attribution + link on Adzuna adverts (their terms).

**Schema warnings:**
- **`jobs` is already taken** — employer-private iRecruit job records
  (migration 0020). Use a new table, e.g. `sponsored_jobs`, with the
  spec's columns (source, source_job_id, title, employer_name,
  sponsor_id → `sponsors.id`, match_status, town, region, salary_min/max,
  soc_code, sector, care_switchers_only, apply_mode, apply_url,
  description, posted_at, expires_at, status, badge_register, badge_role,
  badge_employer_confirmed, checked_at).
- **There is no `profiles` table.** Accounts are `accounts` (role) →
  `candidates` / `employers`. Put member preferences (roles[], regions[],
  topics[], plan, optional consented visa_situation) on `candidates` or
  a new table.
- RLS on every table; signed-in read for jobs.

**Badges and wording (trust layer):**
1. "Licensed sponsor" — "Checked against the register on [date]".
2. "Role meets visa rules".
3. "Employer-confirmed" — Phase 5 only; the **only** badge that may say
   "Confirmed".
Never use "Verified" on sponsor/job badges. Always state that a licensed
sponsor isn't proof the employer will sponsor this job.

**UI:** Jobs tab + job detail page + job cards in Rounds; saved jobs.

## 7. Phase 4 — On-site apply

- Logged-out "Apply" → sign-up with `?next=` back to the job (already
  supported).
- `applications` table (`job_id`, `member_id`, `status`
  new/reviewed/forwarded/rejected, `destination` per job — admin now,
  employer later, `created_at`). Applying is the consent event for that
  job only.
- **No admin role exists yet.** Design one (e.g. a new `accounts.role`
  value or an allow-list) — check with the founder.
- Admin sees applications **in date order, no scores, no ranking**
  (HANDOVER §1 #5).
- CVs in **private** storage (R2 `MEDIA` binding); admins get a link,
  not an attachment. Privacy policy, consent at apply, retention period.
- Notify the admin (destination = open question 5).

## 8. Phase 5 — later

- Employer-confirmed jobs from iRecruit: the existing `jobs.sponsorship_offered`
  field (`none` / `transitional_switch_only` / `new_applicant`, DB-blocks
  `new_applicant` for care roles) is the source of the Employer-confirmed
  badge.
- Premium tier: must never gate job access, applying or the sponsor check.

## 9. Gotchas learned on Phase 1 (will bite you)

- **Supabase MCP holds any SQL containing DELETE/DROP for human
  approval**, and times out after 60s if nobody approves. Either have the
  founder present to approve, or give them the SQL to paste into the
  Supabase SQL editor. Split migrations so non-destructive parts can
  apply on their own.
- **Statement timeouts:** `anon` 3s, `authenticated` 8s. Bulk writes
  through PostgREST must be chunked (a 122k-row insert took 7.2s).
- **pg_safeupdate:** a DELETE with no WHERE is rejected when called via
  PostgREST — write `delete … where true` (or TRUNCATE in a SECURITY
  DEFINER function that runs as the owner).
- **A function-level `set statement_timeout` does NOT lift the 3s anon
  limit** (tested 15 Oct — the timer is armed before the function's SET
  runs). Make the queries fast instead (index-only checks, no big sorts).
- **The deploy workflow shows red but deploys.** Since 24 Sep the
  `CLOUDFLARE_API_TOKEN` lacks **Zone → Workers Routes: Edit** for
  icareltd.com: the Worker uploads, then the routes step fails. Until the
  founder fixes the token, confirm deploys by checking the live site,
  not the Action's colour.
- **Nav is copy-pasted per page** (no shared components). The tab bar
  lives in `src/nav-shell.html` and copies in dashboard, invites,
  pipelines, network, messages, credentials, visibility, member,
  sponsor-check, plus Rounds' icon-nav variant. Adding Jobs and News
  makes 8 tabs — check the bar at 320px wide. Same for the GA consent
  block and the notification bell.
- **Onboarding gate:** `sign-in.html`/`verify.html` send candidates to
  `/onboarding` unless `?next=` is set. New member-facing pages must work
  for half-onboarded accounts (see how `sponsor-check.html` hides the
  tab bar and shows "Finish your profile").
- Brand: purple `#330072`, teal `#00A499`, lavender `#F4F1F8`; Fraunces /
  Public Sans / IBM Plex Mono; always "iCare". `sponsor-check.html` and
  `rounds.html` use these tokens — copy from them.
- Migrations: apply via Supabase MCP *and* save the same SQL as a file in
  `supabase/migrations/` (repo mirror).

## 10. Before every push

- `npm run typecheck` and
  `npx wrangler deploy --dry-run --outdir=<tmp>` must both pass.
- Test pages in a real browser (Playwright is preinstalled) at 390px and
  desktop; check no horizontal overflow and no console errors.
- After merge, verify on `https://icareltd.com` directly.

## 11. Acceptance checks still to pass (from the spec)

- Jobs board and News feed require sign-in; public posts don't.
- A job whose employer isn't on the register never appears.
- A job under £41,700 with no lower-threshold reason fails the role check.
- Care worker jobs are tagged "UK-based switchers only" and can't show
  "new applicant" sponsorship.
- No news post publishes without admin approval; every rule-change post
  links a Tier 1 source and carries the "not immigration advice" footer.
- Applications list in date order with no scores.
- No API keys in the repo, pages or logs.
