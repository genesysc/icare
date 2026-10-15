# Handover: iCare daily news (build next)

Written 15 Oct 2026 for the next agent. Scope: **the daily news feature
only**. The sponsor-register / jobs work is **parked** — leave it alone
(details at the end).

## 0. Read first

1. `HANDOVER.md` in full — especially §1 (non-negotiables), §2 (stack),
   §10 (conventions), §11 (gotchas), §15 (blog), §17 (news drafting
   automation), §19–§22 (Rounds news module), §24 (why both were paused).
2. Last few entries of `PROGRESS.md`.
3. Update `PROGRESS.md` (and `HANDOVER.md` when something a fresh agent
   needs changes) before ending every session — `AGENTS.md` requires it.

The founder's original spec ("iCare: Sponsor Check, UK Sponsored Jobs &
Daily News — Build Handover", 14 Oct 2026, §8) assumed Next.js + Supabase
edge functions + the Anthropic API. **None of that applies** — this
document reconciles it with the real repo. Where they differ, this
document wins.

## 1. The real stack

- One **Cloudflare Worker** (`src/index.ts`, Hono). No frontend
  framework, no build step: every page is a self-contained `src/*.html`
  served with `c.html()`. Do **not** scaffold a Next.js app.
- **Supabase** project `care-register` (`blflbiwqflidltqflwew`). Never
  touch `Meridian Project` / `rah-caregiver-portal`.
- **Scheduled jobs:** GitHub Actions, or the Worker's Cloudflare cron.
- **AI: Cloudflare Workers AI only, free tier.** Founder decision 14 Oct:
  **news must cost nothing — no Anthropic/OpenAI API.**
- **Secrets:** Cloudflare Worker secrets / GitHub Actions secrets. Never in
  the repo, pages, logs or chat.
- **Deploy:** merge to `main` → `.github/workflows/deploy.yml`. ⚠️ That
  workflow has shown **red since 24 Sep even though the code deploys**
  (the Cloudflare token lacks Zone → Workers Routes: Edit). Confirm a
  deploy by checking `https://icareltd.com`, not the Action's colour.

## 2. Decisions already made by the founder (don't re-ask)

- Publish relevant news **every day**, gathered from multiple sources and
  **rewritten as iCare's own content** — never republish others' text.
- **Nothing auto-publishes.** Every post needs the founder's approval.
- **Zero running cost.**
- **Public news articles stay open** (SEO). **The members' News feed
  needs sign-in**, and must work for members who **haven't finished
  onboarding** (people arriving from the launch email).
- **Navigation:** News gets **its own tab**, and news **also appears inside
  Rounds** (`/rounds`, the members' Home feed). The Pipelines tab is
  hidden (done). A Sponsors tab exists (done).
- Candidates are never charged for anything (HANDOVER §1 #1). Any future
  premium tier must not gate news.

## 3. Ask the founder before building (open questions)

| # | Question | Recommended default |
|---|---|---|
| 1 | **Pipeline shape — never answered.** (a) Extend what exists: posts are Markdown in `content/posts/`, approval = founder merges a GitHub PR, published at `/blog/...`. (b) The spec's design: Supabase drafts table + an admin approval screen + public `/news/[slug]` pages. | **(a).** Already built, SEO done, no admin role/screens needed. (b) needs an admin role that doesn't exist yet. |
| 2 | Who approves posts? | Monique, daily. |
| 3 | Where do "draft ready" notifications go (email / Slack)? | Email to a founder address via Sender.net. |
| 4 | Sender.net group for the weekly member digest. | — |
| 5 | Solicitor sign-off on the "not immigration advice" wording. | Use the wording in §6 until then. |
| 6 | The "iCare Design canvas" link (spec mentions a News article / Home feed design). Never received. | Build from `rounds.html` / blog styling if it doesn't come. |
| 7 | Is it OK to re-enable the hidden Rounds news sidebar (§4) once ingestion is reliable, or should Rounds only show iCare's own posts? | Show iCare's own posts + rule alerts; leave the third-party sidebar hidden. |

## 4. What already exists — extend, don't replace

| Piece | State |
|---|---|
| **Blog** `/blog` (`src/blog.ts`, `src/blog-templates.ts`) | **Live and working.** 13 posts in `content/posts/*.md` (frontmatter + Markdown) → `npm run build:blog` → committed `src/blog-content.ts`. Categories: Social Care · NHS & Clinical Careers · Pharmacy & Pharma · Independent Healthcare · **Immigration & Sponsorship** · Workforce Policy. JSON-LD (BlogPosting/FAQ/Breadcrumb), RSS `/blog/feed.xml`, `sitemap.xml`, `llms.txt`, share buttons, GA4. Default author "Charlie Xavier". HANDOVER §15/§23. |
| **Daily drafter** `scripts/daily-news-draft.js` + `.github/workflows/daily-news-draft.yml` (06:00 UTC + manual) | **Built, never once produced a mergeable PR.** Pulls WHO / GOV.UK DHSC / NHS England feeds + 5 Google News RSS queries → clusters stories → drafts with Workers AI (`@cf/zai-org/glm-4.7-flash`, two calls: body then metadata) → Unsplash hero → writes `content/posts/*.md` → `build:blog` → opens a PR. Failures documented in HANDOVER §24: Workers AI timeouts on long outputs, Google News RSS 503 rate-limits. Still scheduled daily; fails safely (no PR). Secrets used: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `UNSPLASH_ACCESS_KEY`. |
| **Rounds news sidebar** (`news_items` table, migration 0048; `src/news.ts` mounted at **`/news`**; `src/news-ingest.ts` on a 2-hourly Cloudflare cron, newsdata.io) | **Hidden on the live site since 24 Sep** (`<aside class="news-col" hidden>` + `loadNews("")` removed in `src/rounds.html`) because ingestion was unreliable (§22/§24). Backend still running. Shows third-party headlines (likes/comments), not iCare articles. `GET /news/ingest-status?secret=…` reports staleness. |

⚠️ **`/news` is already taken** by the signed-in Rounds news API above.
Public articles can't live at `/news/[slug]` unless you move that API.
With option (a) they live at `/blog/[slug]`; the News **tab** page needs a
free path (e.g. `/news-feed`) or the API moved. Decide and document.

## 5. Recommended build, in order

### Step 1 — Make the daily drafter actually produce a PR
Don't debug by repeatedly firing the production workflow (it burns
Workers AI quota and trips Google's rate limit — that's how §24 ended).
Run the script locally / in a session with the same env vars against a
scratch branch, or add a `--dry-run` that writes files without opening a
PR. Likely fixes, in order:
- Drop or throttle the Google News RSS queries; lean on official feeds.
  Prefer RSS/Atom and official APIs; never scrape paywalled sites.
- Add **UK health/care-specific official feeds**, e.g. GOV.UK search Atom
  filtered by organisation — UK Visas and Immigration
  (`https://www.gov.uk/search/news-and-communications.atom?organisations[]=uk-visas-and-immigration`),
  Home Office, DHSC, plus NHS Employers, CQC, NMC, HCPC, Skills for Care,
  Migration Advisory Committee where they publish feeds. Verify every URL
  with `curl` before hard-coding (several "obvious" ones 404 — see §17).
- Keep generation short (one tight article per call) so Workers AI stays
  inside its timeout; or draft fewer, shorter posts.
- Target: **1–3 posts/day**, each opened as one PR the founder can merge.

### Step 2 — Post types (spec §8.3)
- **Rule alert** — a change to visas, sponsorship or registration.
  **Must link a Tier 1 (official) source** or it can't publish. Pinned in
  the feed for 7 days.
- **Explainer** — evergreen (e.g. switching sponsor as a care worker).
- **Sector news** — workforce, pay, regulation, with "what it means for
  you".
- (**Register watch** and **Jobs roundup** depend on the parked sponsor/
  jobs work — skip for now.)

Article structure: **What changed / Who it affects / What to do next**;
links to every source, primary source first; at most **one short quote
per source**; no copied paragraphs; no source images (Unsplash via the
existing pipeline, or iCare graphics). SEO-led; iCare blog voice.

Source tiers (spec §8.1): 1 official (GOV.UK, UKVI, DHSC, Statements of
Changes, MAC, NHS England, NHS Employers, CQC, NMC, HCPC, GMC, Skills for
Care, ONS) · 2 sector press/think tanks (Nursing Times, Community Care,
King's Fund, Nuffield Trust, Health Foundation, RCN) · 3 legal commentary
(never the sole source).

### Step 3 — Zero-AI "rule alert" cards (cheap, reliable, do early)
A scheduled job (GitHub Action or the Worker cron) reads the GOV.UK Atom
feeds above and stores **headline + link + date + source** (no rewriting,
no excerpts beyond a line). Shown as cards in the News tab and **pinned in
Rounds for 7 days**. This gives members something fresh daily even when
the drafter has nothing approved. Needs a small table (or reuse
`news_items` with a source type) — RLS: signed-in read.

### Step 4 — News tab page + Rounds integration
- New signed-in page (no onboarding gate — copy how
  `src/sponsor-check.html` hides the tab bar and shows "Finish your
  profile" for half-onboarded members). Lists: pinned rule alerts, then
  iCare posts (from `BLOG_POSTS` in `src/blog-content.ts` — filter to
  news-type posts), newest first.
- Cards inside `src/rounds.html` (its icon-nav header and glass styling
  are the newest brand system).
- **Feed order = recency + pinning only.** Members' chosen roles/regions/
  topics may drive tags/filters, **never a score about the person**
  (HANDOVER §1 #5).
- Add a **News tab** to the tab bar: `src/nav-shell.html` is the reference
  and it is **copy-pasted** into dashboard, invites, pipelines, network,
  messages, credentials, visibility, member, sponsor-check, plus Rounds'
  icon-nav variant. Update all of them. Check the bar at **320px** wide
  (7–8 tabs).

### Step 5 — Weekly digest
Sender.net, via the `src/email.ts` pattern. Automated mail is **always
from `hello@icareltd.com`, never `info@`** (HANDOVER §2). Only to members
with a lawful basis; unsubscribe link in every send; no bulk import.

## 6. Standing rules for every post and card

- Footer: **"General information, not immigration advice. Check gov.uk or
  a regulated adviser for your situation."**
- Date-stamp every fact that can change; re-check pinned/evergreen posts
  when rules change.
- Never "Verified" or "clean" in DBS contexts (HANDOVER §1 #3).
- Never "candidates never pay" framing.
- Care worker / senior care worker: overseas recruitment closed 22 Jul
  2025, in-country switching until 22 Jul 2028 — never imply overseas
  sponsorship for those roles (HANDOVER §1 #8).
- Copyright: original writing, short quotes only, no reused images or
  article structures; check each source's terms.

## 7. Gotchas

- **Supabase MCP holds any SQL with DELETE/DROP/TRUNCATE for human
  approval** and times out after 60s if nobody approves. Have the founder
  present, or give them the SQL to paste into the SQL editor. Split
  migrations so the non-destructive parts apply on their own. Mirror every
  migration as a file in `supabase/migrations/`.
- Statement timeouts: `anon` **3s**, `authenticated` 8s. A function-level
  `set statement_timeout` does **not** lift them. Keep queries index-only.
- pg_safeupdate: a DELETE with no WHERE fails via PostgREST.
- No `service_role` key anywhere — writes from jobs go through SECURITY
  DEFINER RPCs gated by a shared secret in `app_secrets` (pattern:
  `ingest_news_item()`, migration 0048).
- No `profiles` table — member preferences go on `candidates` or a new
  table.
- `npm run build:blog` must be re-run and `src/blog-content.ts` committed
  whenever a post changes; it hard-fails on bad frontmatter (e.g. `seoTitle`
  > 60 chars).
- Brand: purple `#330072`, teal `#00A499`, lavender `#F4F1F8`; Fraunces /
  Public Sans / IBM Plex Mono; always "iCare".

## 8. Before every push

- `npm run typecheck` and `npx wrangler deploy --dry-run --outdir=<tmp>`.
- Playwright (preinstalled) at 390px and desktop: no horizontal
  overflow, no console errors.
- After merge, verify on `https://icareltd.com` directly.

## 9. Acceptance checks (from the spec)

- No news post publishes without the founder's approval.
- Every rule-change post links a Tier 1 source and carries the "not
  immigration advice" footer.
- Public posts are readable signed-out; the News feed requires sign-in
  and works for members who haven't finished onboarding.
- No API keys in the repo, pages or logs.

## 10. Parked — don't touch unless asked

The sponsor register / Sponsor check work is paused by the founder
(15 Oct). Sponsor check is live with the 14 Oct register, but the daily
refresh doesn't work yet: genesysc/icare#61 (migration 0054 + script
fix) is **open and unmerged**, needs a founder SQL paste and a corrected
GitHub secret. See `docs/HANDOVER_sponsored-jobs-news_remaining-build.md`
§4. The jobs board (Phases 3–5) is also on hold.
