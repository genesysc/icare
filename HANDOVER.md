# iCare — engineering handover (Cloudflare Workers build)

The user is switching agents (out of credits on this one). This document
is the curated entry point for whoever picks this up next — read it
first, in full, before writing any code. **`PROGRESS.md` is the detailed
chronological session log** (every decision, every PR, every dead end) —
consult it for history or specifics this doc doesn't cover, but this file
is where you start.

The product's internal codename is **care·register**; the user-facing
brand is **iCare**. It's a UK health and social care recruitment
marketplace: candidates (carers, nurses, healthcare professionals) build a
profile, verified employers search and shortlist. Currently pre-launch —
live surface is a waitlist landing page, not the product itself.

---

## 1. Non-negotiables — read before touching auth, badges, DBS, search, or pricing

These come from a separate `HANDOVER.md` for an earlier (parallel, not
currently deployed) Next.js build of the same product, which the user
shared partway through this session. They are compliance-driven, not
ordinary product preferences. **If a task seems to require breaking one,
stop and ask the user — do not resolve it yourself.**

1. **Candidates are never charged, for anything.** Employment Agencies Act
   1973 s6(1) (no fee for finding work, directly or indirectly) + 2003
   Conduct Regulations reg. 5 (can't condition work-finding on buying
   other services) + DHSC Code of Practice (stricter for international
   health/social care recruitment specifically). No premium profile, no
   featured listing, **no profile boost, ever, in any framing** — this
   already tripped up an earlier draft of the waitlist copy ("50 bonus
   credit for paid features") and was explicitly rejected once this rule
   surfaced. If a future request implies a candidate payment path,
   surface the conflict before building it.
2. **Badge grades are earned, never bought, never mis-graded.** Four
   fixed grades on `badges.grade` (confirmed against the real DB enum):
   `verified` (checked against a public register/identity provider,
   system-awarded), `evidenced` (document uploaded, human-reviewed),
   `derived` (computed from platform data), `declared` (candidate said
   so, unchecked). UI must keep these visually distinct. No client write
   path to `candidate_badges` should ever exist (RLS: read-only to
   clients). **Trap found and fixed 2026-09-11**: any DB-side function
   that writes to `candidate_badges` — not just client routes — must be
   `security definer`, or it inherits the calling client's role and
   fails RLS. `refresh_experience_badges()` (fired by an AFTER trigger
   on every `employment_history` change) was missing this and broke
   Step 4 of onboarding for every candidate until migration `0032`
   added it. `publish_my_profile()` already had it right — check any
   *new* badge-writing path against that pattern, not just this one.
3. **Never claim a DBS is "verified."** Only the employer can verify a
   DBS, via the DBS Update Service. Correct wording: *"Enhanced DBS · on
   Update Service."* Forbidden: "DBS Certified/Verified/Checked." The
   certificate number (`dbs_records`) is never shown on the open profile
   — only released after shortlist + candidate consent.
4. **Written shortlisting before anything visual.** Equality Act 2010
   exposure. Any future employer-facing search view must exclude photo,
   name, video, and CV file — those unlock only after shortlist +
   consent. Not built on this side yet (no employer search exists), but
   binding on whatever gets built.
   **⚠️ Partially overridden 2026-08-26, founder instruction:** search
   results now show name, current job title, and location up front —
   "i command you to not let it interfere with planning for now... When
   the employer searches the AI should generate the names, current job
   title and location of the candidate." Photo, video, and CV file are
   **still excluded** pre-shortlist — the override is scoped to name/
   title/location only, nothing else here changed. See `SPRINTS.md`
   Sprint 8 for where this is implemented. The reasoning above (a name
   signals gender/ethnicity — indirect-discrimination exposure) still
   stands as the rationale the rule existed for; this is a deliberate,
   informed departure from it, not a correction to the reasoning.
5. **AI never scores, ranks, or filters a candidate.** AI may summarise,
   extract, transcribe, draft — a human decides. A future CV parser must
   propose a draft the candidate confirms; never auto-apply a parse.
   Sharpened further by product-direction notes (see §9): an employer
   conversational AI search is planned, but must be *descriptive, not
   evaluative* (no "fit score"), and must **hard-exclude protected
   characteristics** (Equality Act 2010) from query handling — even if an
   employer phrases a query that way. Not designed or built yet; the
   guardrail needs a real validation layer, not just a prompt
   instruction.
6. **Data minimisation on anything ingested.** A future CV parser must
   not extract DOB, nationality, immigration detail, marital status,
   gender, religion, ethnicity, health info, NI numbers, or photos — flag
   them instead (there's already a `cv_imports.sensitive_found` column
   for this). Postcodes on profile are outward-district only (`EN1`);
   full postcode lives in `candidate_contact`, gated behind shortlist +
   consent. (Already respected: `PATCH /candidates/me`'s whitelist only
   exposes `postcode_district`.)
7. **Regulation 22 (vulnerable persons).** Before a placement: confirm
   identity, qualifications, and **two references**, give the hirer
   copies. No placement feature exists yet on this build — don't let one
   ship without this.
8. **Immigration facts constraining copy/filters.** Overseas recruitment
   for *care worker* and *senior care worker* roles closed 22 July 2025;
   in-country switching runs to 22 July 2028. Don't build copy/filters
   implying overseas sponsorship for those two roles specifically. Other
   healthcare roles are unaffected.

---

## 2. Stack

- **Cloudflare Workers**, TypeScript, [Hono](https://hono.dev/) as the
  router — this is the entire backend + landing page host, one Worker.
- **Supabase** — Postgres + Auth. Same database as the (currently
  dormant) Next.js build referenced in §1.
- **No frontend framework.** The landing page is a single static HTML
  file, text-imported into the Worker at build time and served via
  `c.html()`. No build step beyond `wrangler deploy`.
- **GitHub Actions** for CI/CD (deploy on push to `main`).
- **Workers AI** (`env.AI` binding, `wrangler.jsonc`'s `ai` block) for
  CV parsing (Sprint 5 review pass) — deliberately not the Claude/
  Anthropic API, which was tried first and dropped over its per-call
  cost (founder decision, 2026-08-26). Default to Workers AI for any
  future LLM feature (e.g. Sprint 8's chat search) unless the user says
  otherwise.
- Email (transactional/waitlist) sends live via **Sender.net** — see §8
  item 3. OTP/magic-link delivery (via Supabase Auth's own SMTP, not
  this path) had a real regression fixed on 2026-09-10 (stale DMARC
  record + a sender-address conflict, see the same section) — confirm
  it's still working before assuming so.
- **Email address ownership — firm rule, don't blur this again**: three
  separate mail systems touch this domain and each owns exactly one
  address, never overlapping:
  - `info@icareltd.com` → a real, human-read inbox on **Zoho Mail**. The
    app must never send automated mail claiming to be this address —
    mixing a real mailbox's identity with automated sending from a
    different provider (Sender.net) is what caused the 2026-09-10 OTP
    delivery regression (Gmail silently discarding it, invisible to
    both Sender.net's logs and us).
  - `hello@icareltd.com` → all automated app mail, always via
    **Sender.net** — OTP/magic-link (Supabase Auth's custom SMTP relay,
    Dashboard-configured) and our own stage-completion emails
    (`src/email.ts`'s direct API call). Never a real inbox anywhere.
  - Supabase Auth itself only generates the OTP code/magic-link token
    and needs *some* mail transport handed to it — it doesn't own an
    address, it just uses whichever one its SMTP relay is configured
    with (`hello@`, per the above).

---

## 3. Accounts / access

- **Cloudflare account**: "iCare" (`181e44a6963cb30381a30edbd56a4b46`).
  The OAuth connection in this environment can see a second, unrelated
  Cloudflare account too — **always pass `account_id` explicitly** to
  Developer Platform tools (works even when the tool's declared schema
  doesn't show the param — pass it anyway).
- **Supabase project**: `care-register` (id `blflbiwqflidltqflwew`), org
  "Genesys Consultancy" (`eurukfztpdvalqtjpusu`), region `eu-west-2`.
  **This is iCare's real backend** despite the project's name. Two other
  unrelated projects exist in the same org (`Meridian Project`,
  `rah-caregiver-portal`) — **do not touch those**. The org is at its
  2-project free-tier active-project cap already; don't create new
  Supabase projects without checking with the user first.
- **Sender.net account**: "Genesys Consultancy Ltd" (id `egLgor`, free
  plan). Only `genesysconsultancy.co.uk` is a verified sending domain —
  the user wants a dedicated `icare` domain before any email actually
  sends (see §8).
- **GitHub**: `genesysc/icare`. Dev branch:
  `claude/cloudflare-icare-setup-qt575f`. Workflow so far: one PR per
  logical change, merged via squash; after each merge, the branch gets
  reset from `origin/main` before starting the next change (see §7 for
  why this matters).

---

## 4. File map (this repo)

| File | What |
|---|---|
| `wrangler.jsonc` | Production Worker config (`icare`, bound to `icareltd.com`) — account id, vars (Supabase URL/key, `SENDER_FROM_EMAIL`/`SENDER_FROM_NAME`), R2 binding, the `Text` import rule for `.html`. `SENDER_API_KEY` is a secret (`wrangler secret put`), not in this file |
| `wrangler.staging.jsonc` | Added 2026-09-02, not committed-and-forgotten — a real, reusable staging deploy target (`icare-staging`, `workers.dev` only, no custom-domain routes) so unmerged branches can be tested end-to-end against the same real Supabase/R2/Sender.net backend without touching production. Deploy: `CLOUDFLARE_API_TOKEN=<token> npx wrangler deploy --config wrangler.staging.jsonc`. Live at `https://icare-staging.icare-181.workers.dev`. `deploy.yml`'s `workflow_dispatch` also gained a `target: production\|staging` input for the same purpose via CI, though the CLI path above is what actually got used this session (CI runner was slow/queued once, see PROGRESS.md) |
| `src/index.ts` | Route mounting, `GET /`, `/health`, `/db-check`, `/professions`, `/skills`, `/badges`, `/qualification-types`, `/prompts`, `/media-check` |
| `src/auth.ts` | `POST /auth/request-code`, `POST /auth/verify-code`, `POST /auth/logout`, `GET /auth/me`, **2026-09-15** `POST /auth/sign-in-password`, `POST /auth/forgot-password`, `POST /auth/update-password`, `POST /auth/oauth/:provider`, **2026-09-16** `POST /auth/sign-up-password`, `POST /auth/resend-signup-code`, `POST /auth/complete-oauth-employer-signup`, `PATCH /auth/me` — see §6 |
| `src/middleware.ts` | `requireAuth` — verifies bearer token, attaches an RLS-scoped Supabase client + user id/object to context |
| `src/candidates.ts` | Candidate profile CRUD, photo + video upload/download, publish + new `/me/unpublish` (Sprint 21 — the reversible other half of publish, see §14), professions/skills, employment history, qualifications (+ evidence upload), registrations, DBS (singleton upsert), references, self-expression prompts, posts (`/me/posts` CRUD — open-by-default, now with a `visibility` public/connections field, Sprint 24 — see §5/§14; **2026-09-12** — also `post_type`/media/check-in fields + `mentioned_candidate_ids`, `POST /me/posts/media`, `GET /posts/:id/media`, `GET /mention-search`, `GET /checkin/venues`, `GET /posts/:id/mentions`, reactions/comments — `POST /posts/:id/reaction`, `GET`+`POST /posts/:id/comments`, `DELETE /comments/:id`), `GET /feed` (Sprint 22 — reads `candidate_peer_feed`, see §14), `GET /discover`, `GET /network` (now also returns each request's optional `note`, **2026-09-12**), `POST /network/request` (accepts an optional `note`, **2026-09-12**), `POST /network/:id/accept`, `DELETE /network/:id` (Sprint 23 — connections, see §14), new `GET /:id/photo` (Sprint 24 — peer-to-peer photo, no consent gate, only `current_role_is('candidate')` + `candidate_is_published()` — see §14), `GET /messages`/`GET /messages/unread-count`/`POST /messages/start`/`GET /messages/:id`/`POST /messages/:id` (**2026-09-12** — 1:1 messaging, gated to accepted connections via `get_or_create_conversation()`, see PROGRESS.md), incoming shortlists + consent (`/me/shortlists*`, Sprint 9, re-scoped to per-pipeline `/me/shortlists/:id/consent` + new `/withdraw` in Sprint 14/15 — see §14; `/withdraw` now also takes an optional `reason` from a fixed list, stored as `decline_reason` — Sprint 18), badges (read-only), close-account, onboarding advance/complete, CV import (upload → Workers AI parse → review/apply) |
| `src/employers.ts` | Employer verification flow (Sprint 7): read own employer row + verification-request history, submit/re-submit for review; `POST /posts/:id/report` — report a candidate post; `GET /pipeline` — read-only iRecruit pipeline view (Sprint 9, now with `job_title`); `GET /candidates/:id/{photo,video,cv}` — consent-gated media (Sprint 9); `GET /bookmarks`, `DELETE /bookmarks/:candidateId` (Sprint 14) |
| `src/employer-chat.ts` | Employer chat — seven tools behind `POST /employers/chat` (guardrail → Workers AI tool call → deterministic DB action → persist), `GET /employers/chat` (replay thread): `search_candidates` (Sprint 8, extended for posts, `min_experience_years`, `qualification_type_id`), `bookmark_candidates`/`send_invite` (Sprint 14, replacing Sprint 9's `shortlist_candidates` — see §14), `move_candidate_stage` (Sprint 9, now keyed by `pipeline_id` not `candidate_id`, Sprint 14)/`get_pipeline_status` (Sprint 9), `bulk_move_stage` (Sprint 11), `who_is_summary` (Sprint 10) |
| `src/employer-chat-guardrail.ts` | Protected-characteristics keyword/proximity guardrail — the deterministic layer behind the chat's non-negotiable #5 compliance, see §7 |
| `src/jobs.ts` | Jobs module (Sprint 13, mounted at `/employers/jobs`): `POST /draft` (Workers AI drafts the description body), `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `PATCH /:id/close` — see §14 |
| `src/waitlist.ts` | `POST /waitlist`, `GET /waitlist/count` |
| `src/email.ts` | `sendTransactionalEmail` — real Sender.net API call, live since 2026-09-02, see §8 item 3 |
| `src/emails/waitlist-welcome.ts`, `employer-waitlist.ts`, `candidate-profile-published.ts`, `employer-verification-submitted.ts`, `employer-verified.ts` | Stage-completion email subject/HTML, wired at their call sites and actually sending as of 2026-09-02 (see §8 item 3). The first two are for the waitlist; the latter three are candidate/employer product-stage emails, added 2026-08-26 |
| `src/emails/candidate-invite-received.ts` | **NEW 2026-09-15.** Sent from `employer-chat.ts`'s `send_invite` tool, once per newly-inserted shortlist row — the one notification event type (of the four in migration 0043) that also emails, not just an in-app dot, since an invite is a real job opportunity and candidates return every few months per §6 |
| `src/landing.html` | **Rebuilt 2026-09-14.** The public launched-state landing page at `/` — single self-contained file, inline CSS, three bundled photos from `src/assets/`, and (deliberately) **no JavaScript at all except the magic-link recovery below**. Positioning comes from the founder's market-research handover: *"iCare is your passport for your next job in health and care"* — verify once, carry that trust to every employer. Sections: hero → the problem (three cited stats) → how it works (three steps) → badge grades (dark band) → precedent (NHS staff banks prove the model, scoped to NHS temp/bank only) → who it's for → what we will never do → employers strip → final CTA → footer. CTAs are real product entry points (`/sign-up`, `/sign-in`, `/employers`); the waitlist capture form that used to live here is **gone** (the `POST /waitlist` API and the employer page's own form are untouched). Still recovers a magic-link sign-in that lands here by mistake (2026-09-02 fix, see §14/PROGRESS.md) — checks for `#access_token=` in the URL hash on load, before anything else runs, and forwards to `/verify`. **Keep that script first in `<head>` through any future rewrite.** |
| `src/assets/` | **NEW 2026-09-14.** Landing-page photography: `hero-clinician.jpg`, `care-hands.jpg`, `workforce-corridor.jpg`, plus `CREDITS.md` recording the Unsplash License, the source URL and fetch params for each. Bundled into the Worker as `Data` modules (see the `rules` entry in both `wrangler*.jsonc`) rather than hotlinked from a stock-photo CDN — no third-party request from a page that talks about privacy, and no silent breakage if the CDN changes URLs. `src/assets.d.ts` declares `*.jpg` as `ArrayBuffer` for TypeScript. Served by `GET /assets/:name` from a fixed map in `index.ts` (never a path read off the request — no traversal surface), `immutable` + one year of cache |
| ~~`src/welcome.html`~~ | **Deleted 2026-09-14.** Existed 2026-09-10 → 2026-09-14 only because `/` was still the pre-launch waitlist page and nothing anywhere had a real Log in / Sign up CTA. The 2026-09-14 rebuild made `/` exactly that page, so keeping both would have meant two near-identical pages drifting apart. `GET /welcome` now **302s to `/`** rather than 404ing — the URL was live, so anything already pointing at it still lands somewhere sensible |
| `src/employers.html` | Employer waitlist landing page — separate design system, same self-contained pattern |
| `src/privacy.html` / `src/terms.html` | Draft legal pages (Sprint 0) — explicitly marked DRAFT, not lawyer-reviewed |
| `src/auth-client.js` | Shared client-side auth helper — reference file, not imported; copy into each signed-in page's own `<script>` tag |
| `src/sign-in.html` | Candidate sign-up/sign-in, mounted at both `/sign-up` and `/sign-in`. **2026-09-15/16**: password (show/hide toggle, "Forgot password?" → `/reset-password`) is now the default method on **both** sign-in and sign-up, a "Sign up/in with a code instead" link falls back to the original OTP flow either way, and "Continue with Google"/"Continue with LinkedIn" OAuth buttons appear in both modes too (gated behind the Terms checkbox in signup mode). Two-axis `mode-signup`/`mode-otp` CSS/JS scheme — see §6 |
| `src/employer-sign-in.html` | Employer sign-up/sign-in (Sprint 6), mounted at both `/employer/sign-up` and `/employer/sign-in`, own purple/teal design system. **2026-09-15/16**: same password/forgot/OTP-fallback/OAuth treatment as `sign-in.html`, including OAuth on sign-up — employer OAuth signup routes through `/verify`'s org-name step since org_name can't ride through the OAuth redirect (see §6) |
| `src/reset-password.html` | **NEW 2026-09-15.** `/reset-password`, shared by both audiences (mirrors `verify.html`'s sharing pattern). Dual-purpose: no recovery token in the URL → request-a-reset-link form (`POST /auth/forgot-password`); `#access_token=&refresh_token=` in the URL (a real recovery link) → set-new-password form (`POST /auth/update-password`) that completes sign-in on success. Also how a pre-existing OTP-only account sets its first password — no separate flow exists for that |
| `src/verify.html` | OTP code entry, `/verify?email=...&role=...&flow=...` — shared by both audiences, branches the post-verify redirect on the account's real role from `GET /auth/me`. Also now handles being opened via the emailed magic link directly (2026-09-02 fix) — reads `#access_token=&refresh_token=` off the URL hash (the implicit-flow shape `auth.ts`'s new `emailRedirectTo` produces) and completes sign-in without the manual code form. Code input widened to `maxlength="10"` — this Supabase project issues 8-digit codes, not 6. **2026-09-15**: also the OAuth callback target (`redirectTo` for `signInWithOAuth`) — same hash-parsing code path handles it. **2026-09-16**: `?flow=signup-password` sends `type:"signup"` on `/auth/verify-code` and uses `/auth/resend-signup-code` for resend instead of `/auth/request-code`; `?flow=oauth-signup&role=employer` — when the resulting account role is `candidate` (the real, safe OAuth default — see §6) — shows an inline "What's your organisation?" card instead of redirecting into candidate onboarding, calling `POST /auth/complete-oauth-employer-signup`; also backfills `accounts.full_name` from the OAuth session's `user_metadata` via the new `PATCH /auth/me` when it's empty |
| `src/employer-home.html` | Employer home, `/employer/home` — verification card (Sprint 7, now including a read-only org profile summary once verified — Sprint 11) + chat-based candidate search (Sprint 8) + iRecruit pipeline card (Sprint 9, now showing consent-gated photo/video/CV buttons) |
| `src/onboarding.html` | The full onboarding wizard (Sprint 2: basics/skills/availability; Sprint 3: employment history/qualifications/registrations; Sprint 4: DBS/references/prompts; Sprint 5: photo/review/publish) — 11 steps, spans Sprints 2–5, complete as of Sprint 5. Also accepts `?step=N` to jump to an already-completed step (used by the dashboard's "Edit" links) |
| `src/dashboard.html` | The real candidate Profile page (Sprint 5, **rebuilt LinkedIn-style 2026-09-14** — see PROGRESS.md for the full section-by-section list and the honesty note that this replicates LinkedIn's well-known general layout, not a live scrape). Header: gradient banner + overlapping photo, real name (`GET /auth/me`) → position (from `employment_history`) → location (town only) → an "Open to new roles" pill → a two-tier identity check, icon+colour (migration 0042 — see PROGRESS.md): purple "Fully Verified" or teal "Identity Verified" → right-to-work + an honest "ID on file: Not yet collected" line (no passport/ID upload exists anywhere in this app, by deliberate choice). Then: About (`candidates.about`, newly surfaced), Badges (folded into one collapsible section, hand-authored SVG icon per family — 2026-09-14), Experience (real inline entries), Licenses & Certifications (qualifications + registrations + DBS combined), Skills (professions + clinical skills, `GET /me/skills`), a slim "More about you" list for References/prompts, Activity (posts, compose/list/delete), incoming shortlists + consent toggle (Sprint 9), Visibility, account closure. Tab-bar shell sits at the bottom (Sprint 19) |
| `src/invites.html` | Jobseeker Invites screen (Sprint 18), `/invites` — implements wireframe screens 03/04 against the existing `/me/shortlists*` routes: New/Accepted/Declined tabs (derived client-side from `candidate_consented_at`/`closed_at`, no new status field) and a detail view per tab — undecided invites get the full "if you accept" consent panel with Accept/Decline/Decide later and a fixed six-option decline-reason picker; accepted ones get a Withdraw action; declined ones are read-only. Does NOT implement the wireframe's 7-day auto-expiry countdown (needs an `expires_at` column set at invite creation plus a scheduled job — real scope, flagged not built) |
| `src/pipelines.html` | Jobseeker Pipelines screen (Sprint 19), `/pipelines` — implements wireframe screen 05 against the same `/me/shortlists*` data as `invites.html`. Active/Closed tabs, but scoped to rows that were actually accepted (`candidate_consented_at` set) — an invite declined before ever being accepted lives only on `invites.html`'s Declined tab, never here, matching the wireframe's own stated principle that a pipeline is a state you sit in *after* the invite decision. Detail view renders a real six-stage tracker (done/current/upcoming) plus a Withdraw action for active pipelines, or a closing note for closed ones. One deliberate deviation from the wireframe's own screen-05 example, documented in the file's header comment: a Successful/Onboarding pipeline stays in Active here (this backend's `closed_at` means access-revoked, not "reached a terminal stage" — see `employer-chat.ts`'s `move_candidate_stage`) |
| `src/rounds.html` | The real feed (Sprint 22, **corrected Sprint 24 — see §14; renamed Home → Rounds and extended 2026-09-12, see PROGRESS.md**), `/rounds` (`/home` 301-redirects here) — pinned "new invites" strip, a composer (`POST /me/posts`, `visibility` public/connections toggle **unchanged**, now also a progressive-disclosure "+ Add to your post" for photo/video/document/mention/check-in) and a real cross-candidate feed (`GET /candidates/feed` → `candidate_peer_feed` view) with reactions ("Helpful") and comments. Identity (real name + photo) shown unconditionally, free-for-all between candidates — Sprint 24 reversed Sprint 22's name-free attribution, which was a mistaken extension of the employer-consent pattern. The "Profile strength" card that used to live here was removed 2026-09-12 |
| `src/network.html` | The real Network (Sprint 23, **corrected Sprint 24 — see §14; Requests folded into Connections 2026-09-12, see PROGRESS.md**), `/network` — LinkedIn-style connections: now two tabs, **Connections** (pending requests shown above the accepted-connections list, with the request count badge that used to live on a separate Requests tab) and **Discover** (unchanged — profession/location search, not name). Connect now reveals an optional note (`connections.note`) before sending instead of sending immediately. Identity (real name + photo) is shown unconditionally, not gated by connection status — Sprint 24 reversed Sprint 23's "accept reveals name" mechanic, which was a mistaken extension of employer consent to the peer-to-peer context. Connections list itself stays private (RLS: only the two parties in a row can read it). Org "Follow" explicitly deprioritised by the founder, not built |
| `src/credentials.html` | Credentials & documents (Sprint 20), `/credentials` — implements wireframe screen 07, reached from `dashboard.html`'s badges card rather than a sixth tab-bar destination (matches the wireframe's own information architecture — Credentials sits one level under Profile, not beside it). Badges section is copied verbatim from `dashboard.html`'s own rendering; DBS and sponsorship-status (`right_to_work`) blocks are new but read/write only existing fields via existing routes. Deliberately does NOT implement the wireframe's three-state DBS model ("Not Yet Verified" / "Current — no new information" / "New information reported") — see the file's header comment and the note below for why |
| `src/visibility.html` | Visibility (Sprint 21), `/visibility` — implements wireframe screen 08, reached from a new "Visibility" card on `dashboard.html`. The master "Findable by employers" switch is real and reversible: `candidates.is_published` existed already but had no way back to `false` short of closing the whole account, so this sprint added `POST /candidates/me/unpublish` (`candidates.ts`) as the missing other half of the existing `/me/publish`. The wireframe's field-by-field visibility matrix (About/Experience Public, Registrations/Availability Employers-only, etc., each independently toggleable) is NOT built — no such preference exists anywhere in the schema, `candidate_search` is a single fixed view. This page shows a read-only, accurate breakdown of what's actually exposed instead of fake per-field toggles — see the file's header comment |
| `src/messages.html` | Candidate-to-candidate 1:1 messaging, `/messages` — **2026-09-12.** Inbox + thread view against `conversation_inbox`/`messages`, gated to accepted connections only (`get_or_create_conversation()` RPC). Reached from `network.html`'s Connections tab ("Message" button, `/messages?with=<id>`) or the tab bar directly. See PROGRESS.md's 2026-09-12 entry for the fuller story (this shipped out of a parallel build that also produced a Home/Network/Profile duplicate — NOT shipped, reactions/comments/mentions/check-in also NOT shipped, both parked pending the founder's review) |
| `src/nav-shell.html` | Reference file for the signed-in tab-bar shell (Sprint 19, six destinations — Messages added 2026-09-12, Home renamed to Rounds same day) — same "not imported, copy verbatim" convention as `auth-client.js`. Rounds/Invites/Pipelines/Network/Messages/Profile as a bottom-fixed bar at every viewport size (this codebase has no other desktop-specific layout), hand-authored inline SVG icons, one unread dot remaining (Invites — business state, see `notifications-bell.html`). Copied into `dashboard.html`, `invites.html`, `pipelines.html`, `rounds.html`, `network.html`, `messages.html`, `credentials.html`, `visibility.html` — update all eight if this file changes. **2026-09-15**: two real gaps found and fixed while wiring in the notification bell (below) — the Messages tab's own dot was dead markup, never wired up anywhere, now removed entirely in favour of the bell's unread indicator; and `credentials.html`/`visibility.html` had silently drifted to a stale five-item copy missing the Messages tab altogether, now brought current. Neither had been noticed because nothing exercised them until this pass touched every page in the list |
| `src/notifications-bell.html` | **NEW 2026-09-15.** Reference file for the header notification bell — same "not imported, copy verbatim" convention as `nav-shell.html`/`auth-client.js`. Covers all four notification types (`notifications` table, migrations 0043/0044): connection request, connection accepted, message (with a body preview, matching `conversation_inbox`'s own convention), invite. Dropdown panel, unread dot, mark-one-read on click-through, mark-all-read. Copied into the same eight pages as `nav-shell.html`, placed in `<header class="nav">` next to Sign out (that header's two-child row became a `.nav-right` wrapper to fit it — **`.nav-right` must carry `position: relative`**, since the dropdown anchors against it, not against the bell's own small wrapper; anchoring to the wrapper instead left ~104px of the panel rendering off-screen left at 320px width, found only by checking a real narrow-viewport render, not by whether the panel opened) |
| `src/html.d.ts` | Ambient module declaration so `tsc` accepts importing `.html` as a string |
| `.github/workflows/deploy.yml` | CI: typecheck, `wrangler deploy` on push to `main` |
| `PROGRESS.md` | Full session log — read for history/detail this doc doesn't cover |
| `SPRINTS.md` | Forward-looking roadmap — candidate journey sprints, then employer journey sprints. Check here before picking "what's next" |
| `AGENTS.md` / `CLAUDE.md` | Pointer files: read `PROGRESS.md` (and now this file) first, update before ending a session |

**`supabase/migrations/*.sql` now mirrors the live database**
(2026-08-26) — all 19 migrations to date (`0001_init` through
`0019_candidate_dossier_rpc`) are committed as files,
fetched verbatim from `supabase_migrations.schema_migrations`
(its `statements` column holds the exact SQL each migration ran). This
is a point-in-time backup/version-control mirror, not a live sync —
migrations are still applied to the real project via `apply_migration`
(MCP) as before; **whoever adds a new migration going forward should
also write the matching file here** to keep the mirror current, the
same way this repo already expects `PROGRESS.md`/`HANDOVER.md` to be
kept current by hand. Nothing here changes how `apply_migration` itself
works — this is purely a "so it isn't only visible from inside
Supabase" archive.

---

## 5. Data model

Full schema detail is in `PROGRESS.md`; summary here. The database
already has 23+ tables from the original build: `accounts` (role,
status) → `candidates` or `employers`, with satellites
(`candidate_professions`, `employment_history`, `qualifications`,
`registrations`, `dbs_records`, `candidate_skills`, `candidate_prompts`,
`candidate_references`, `candidate_badges`, `cv_imports`), restricted
tables gated by shortlist+consent (`candidate_contact`, full DBS cert
number, the CV file itself), and reference data (`professions`,
`clinical_skills`, `qualification_types`, `prompts`, `badges`). RLS is
enabled everywhere; the pattern throughout is `*_self` policies (a user
can read/write only their own rows) plus narrow published/verified-gated
read policies for the employer side.

This build added: **`waitlist`** (`email` unique, `full_name`, `phone`,
`created_at`) — RLS allows anyone to insert, nobody to read the raw
table; a `SECURITY DEFINER waitlist_count()` RPC exposes just the
aggregate count. **`employer_chat_messages`** (Sprint 8, RLS self-only)
— the persisted employer chat thread, one row per message, with
`tool_call`/`result_count`/`results_snapshot` populated on messages
that ran a search. **`candidate_search`** (a view, from `0001_init`,
rewritten in Sprint 8's `0013` migration) is the actual query surface
employer search runs against — corrected to require
`is_verified_employer()` in its own `WHERE` clause (it had no gate at
all before) and extended with `full_name` (never email/phone),
current job title/employer (via a `LATERAL` join to
`employment_history`), and full `profession_ids`/`skill_ids` arrays.

**`candidate_posts`** (migration `0015`, same day as Sprint 8, RLS
self-only) — a candidate's own free-form posts, open by default (see §5
below for the consent-model correction). **`candidate_post_search`** (a
view, same bypass-RLS pattern as `candidate_search`) is the employer
query surface: published + not flagged + candidate published +
`is_verified_employer()`.

**`shortlists`** (Sprint 9, same day — pre-existing table, extended)
gained `stage` (text + check constraint: `shortlisted`/`interview`/
`offer`/`hired`/`rejected` — deliberately not a native enum, so the list
can be extended later with a constraint swap rather than `ALTER TYPE`),
`stage_updated_at`, a `(employer_id, candidate_id)` unique constraint,
and a new `shortlists_employer_update` RLS policy (employers previously
had INSERT+SELECT only, no way to change a stage).

Useful existing RPCs: `current_role_is(role)`, `is_verified_employer()`,
`close_my_account(reason)`, `publish_my_profile()`,
`total_experience_months(candidate_id)` (used by `candidate_search`),
`flag_candidate_post(post_id, reason)` (security definer — lets a
verified employer report a post without any direct write grant on
`candidate_posts`), `set_shortlist_consent(employer_id, consent)`
(security definer, revocable — the candidate-side consent gate for
photo/video/CV), `get_candidate_dossier(candidate_id)` (security
definer — the structured-data source for Sprint 10's `who_is_summary`;
`employment_history`/`qualifications` have no employer-facing RLS at
all, so this one RPC is the actual gate, checked once rather than
bolted onto five tables).

---

## 6. Auth

**Hybrid: password (default) + OTP fallback, for both sign-in AND
sign-up; OAuth (Google/LinkedIn) available on both too.** The original
build used password auth, was switched to OTP-only mid-session for a real
reason (candidates return every few months; a forgotten password is a
lost candidate; magic links were rejected because opening one in a mobile
mail app loses the session in a different browser) — see the git history
around 2026-08-25 for that rationale if it resurfaces. **2026-09-15,
founder-requested reversal**: password sign-in came back as a hybrid, not
a full replacement, with the founder told the original rationale first
(flagged, not silently overridden). **2026-09-16, founder explicitly
widened it**: "Sign ups should be asked for passwords! OAuth buttons
should also appear in Sign ups!" — the two scope boundaries drawn the day
before (password/OAuth on sign-in only) were exactly what got pushed
back on, so both were built out properly rather than just flipping a CSS
rule. Design:

- **Sign-in and sign-up** (`sign-in.html`/`employer-sign-in.html`) share
  one two-axis mode scheme now: `mode-signup` (vs. signin) and `mode-otp`
  (vs. password) — every combination is a real working state. Password +
  confirm-password (both with a show/hide eye-icon toggle) is the default
  method for both audiences; a "Sign up/in with a code instead" link
  switches to the OTP flow in-page for either. A "Forgot password?" link
  (sign-in only) goes to `/reset-password`. OAuth's Terms checkbox gate
  (see below) applies to signup mode regardless of method.
- **`POST /auth/sign-up-password`** — `{ email, password, role,
  full_name, org_name?, terms_version }` → Supabase's `auth.signUp()`
  (not `signInWithOtp()`) — the one call that both sets a password AND
  accepts the same `data` payload `handle_new_user()` reads, so account
  creation works exactly like OTP signup, just with a password from the
  start. Sends a confirmation code/link the same way OTP signup does;
  `/verify` needs `type: "signup"` (not `"email"`) to verify that code —
  see `POST /auth/verify-code`'s new optional `type` field and
  `/verify?...&flow=signup-password`. Resending uses a distinct route,
  **`POST /auth/resend-signup-code`** (Supabase's `resend({type:
  "signup"})`, not another `signInWithOtp` — a signUp()'d user isn't a
  passwordless-OTP user, `request-code`'s resend would 400 against it).
- **`GET/POST /reset-password`** (`src/reset-password.html`, shared by
  both audiences like `verify.html`) is dual-purpose: no recovery token
  in the URL → email-entry form (`POST /auth/forgot-password`, always
  replies `{status:"ok"}` — no enumeration); a `#access_token=&
  refresh_token=` recovery token in the URL (same implicit-flow shape
  `verify.html` already parses for magic links) → set-new-password form
  (`POST /auth/update-password`, bearer-authenticated with that token),
  completing sign-in on success. Also how a pre-existing OTP-only account
  (or any account that skipped the password step) sets its *first*
  password.
- **OAuth** (`POST /auth/oauth/:provider`, allow-listed to `google` and
  `linkedin_oidc`) — "Continue with Google"/"Continue with LinkedIn" now
  shown on **both** sign-in and sign-up, both audiences. The real
  structural problem this ran into, and how it's solved:
  `signInWithOAuth()` has no `data` option, so `handle_new_user()` (which
  reads `signup_role` from `raw_user_meta_data`) never sees a role for a
  brand-new OAuth account — **it does NOT fail or skip creating the
  row though**; its `CASE` clamp defaults an unset/unrecognised role to
  `'candidate'` (checked by reading the function's actual source before
  building any of this, not assumed). That default is exactly right for
  a candidate OAuth signup — nothing extra needed there at all. It's
  *wrong* for an employer clicking "Continue with Google" on
  `/employer/sign-up` — they'd silently become a mis-rowed candidate.
  Fixed with:
  - `role`/`flow` are passed as JSON body fields to `POST /auth/oauth/
    :provider` and forwarded as plain query params on `redirectTo`
    (Supabase doesn't touch them, just redirects the browser to that
    exact URL with the session tokens appended to the hash) — so they
    arrive on `/verify` alongside the tokens.
  - `/verify` reads them: if the resulting account role is `candidate`
    but `flow=oauth-signup&role=employer`, it shows a small inline
    "What's your organisation?" card instead of redirecting straight
    into candidate onboarding.
  - That card calls **`POST /auth/complete-oauth-employer-signup`**
    (`requireAuth`, `{org_name, terms_version}`), which calls the new
    **`complete_oauth_employer_signup(p_org_name, p_terms_version)`**
    security-definer RPC (migration `0043`). It converts the
    just-auto-created candidate row to an employer row (deletes
    `candidates`/`candidate_contact`, inserts `employers`/
    `employer_verification_requests`, flips `accounts.role` +
    `raw_app_meta_data.role`) — **guarded to only ever apply to an
    account created in the last 10 minutes**, so it can complete a
    signup in progress but can never re-role an established candidate
    with real profile data. Idempotent (a second call on an
    already-converted account is a no-op) — checked directly against
    `pg_policies`/the trigger source before writing it, same discipline
    as every other badge/account-writing function in this codebase (see
    non-negotiable #2's trap).
  - **Full name backfill**: OAuth providers populate
    `raw_user_meta_data` differently (Google reliably sets `full_name`;
    some OIDC providers only set `name`), so `handle_new_user()`'s read
    of `full_name` can come up empty. `/verify` backfills it client-side
    from whichever the session's `user_metadata` actually has, via a new
    narrow **`PATCH /auth/me`** (`{full_name}`) that only ever writes
    when the account's own `full_name` is still empty — enforced
    server-side, not just trusted to the caller.
  - **Terms acceptance gate added to the OAuth buttons themselves** — a
    real gap found while building this: OAuth buttons previously
    bypassed the signup form's Terms checkbox entirely (they're not part
    of form submission). Both sign-in pages now block an OAuth click in
    signup mode until the checkbox is checked.
  - **Known minor gap, not solved this round**: a candidate OAuth signup
    has no equivalent "complete-oauth-signup" step, so `terms_version`/
    `terms_accepted_at` stay null on `accounts` for OAuth-created
    candidates (the click-time Terms checkbox gate above is the real
    compliance action taken; there's just nowhere server-side to record
    *which* version they agreed to for this one path). Worth a real fix
    if that record ever matters legally — not urgent, flagged rather
    than silently accepted.
  - **Facebook still not wired** (heavier setup — Meta business
    verification/app review for public use); the backend route is
    generic enough that adding it later is just adding `"facebook"` to
    the `OAUTH_PROVIDERS` allow-list in `auth.ts` plus a third button.
  - **Manual step, not done yet, blocks all OAuth buttons from
    working**: each provider needs a real app registered in its own
    developer console (Google Cloud Console → OAuth client; LinkedIn
    Developer Portal → app with the "Sign In with LinkedIn using OpenID
    Connect" product) and its Client ID/Secret pasted into Supabase
    Dashboard → Authentication → Providers. No tool in this session's
    toolset can do that — same category of manual Dashboard step as the
    OTP email template fix below.

Routes (`src/auth.ts`):

- `POST /auth/request-code` — `{ email, create?, role?, full_name?, org_name?, terms_version? }`.
  One entry point for both sign-up and sign-in OTP; `create` (default
  `true`, maps to Supabase's `shouldCreateUser`) is the only difference —
  pass `create: false` on a sign-in screen so an unrecognised email
  doesn't silently create an account. `role` (`candidate`|`employer`) is
  required when `create` is true.
- `POST /auth/verify-code` — `{ email, token, type? }` (the 6-8 digit
  code) → `{ user, session }`. `type: "signup"` for a code from
  `sign-up-password`'s `signUp()` call; omit/`"email"` for every other
  flow (the original `signInWithOtp` shape).
- `POST /auth/sign-up-password` — `{ email, password, role, full_name,
  org_name?, terms_version }` → `{ status: "ok", session: null | Session
  }` (null unless email confirmation is off on this project).
- `POST /auth/resend-signup-code` — `{ email }` → resends a signup
  confirmation via `resend({type: "signup"})`.
- `POST /auth/sign-in-password` — `{ email, password }` → `{ user,
  session }`, or a generic 401 (Supabase deliberately returns the same
  "Invalid login credentials" for a wrong password and for no password set
  at all — the frontend copy accounts for that ambiguity).
- `POST /auth/forgot-password` — `{ email }` → always `{status:"ok"}`.
- `POST /auth/update-password` — `{ password }`, `requireAuth` (bearer
  token from the recovery link) → `{status:"ok"}`.
- `POST /auth/oauth/:provider` — `{ role?, flow? }` → `{ url }` to
  redirect the browser to, or a 400 if the provider isn't allow-listed or
  isn't configured in Supabase. `role`/`flow` ride through as query
  params on the callback URL, read back by `/verify`.
- `POST /auth/complete-oauth-employer-signup` — `{ org_name,
  terms_version? }`, `requireAuth` → calls the `complete_oauth_employer_
  signup` RPC (migration `0043`). See above.
- `POST /auth/logout`, `GET /auth/me` — both need
  `Authorization: Bearer <access_token>`.
- `PATCH /auth/me` — `{ full_name }`, `requireAuth` → only writes when
  the account's own `full_name` is currently empty.

**✅ Two bugs found live-testing password sign-in, both fixed
2026-09-16 (migration 0045 + a frontend fix, see PROGRESS.md for the
full story):**
1. `POST /auth/sign-in-password` 500'd for any `auth.users` row with
   `NULL` in `confirmation_token` and seven similar text columns —
   GoTrue's driver can't scan `NULL` into them. Only ever hit the
   `@icare-test.invalid` seed candidates (raw-SQL-inserted, bypassing
   GoTrue's own defaults that set these to `''`); no real account was
   affected. Migration 0045 sweeps every existing row and adds a
   `BEFORE INSERT OR UPDATE` trigger (`normalize_auth_user_tokens`) so a
   future raw-SQL-seeded account can't reintroduce it.
2. A password-reset link could fall back to `/sign-in` (same class of
   Redirect-URL-allow-list drift as the 2026-09-14 signup bug) and get
   forwarded straight to `/verify` by the existing hash-recovery script
   — completing a sign-in and silently skipping the "set new password"
   form. The recovery script (`landing.html`/`sign-in.html`/
   `employer-sign-in.html`/`employers.html`) now checks the hash's
   `type=` and routes `type=recovery` to `/reset-password` instead,
   every other type unchanged.

**Stale note, left as a historical marker of how early this was
written**: this originally said the Magic Link template's `{{ .Token }}`
was unconfirmed and blocked on a manual Dashboard step. Long since
overtaken by events — see §8 item 3 and PROGRESS.md's 2026-09-10 and
2026-09-14 entries for the real, much longer story (a DMARC conflict,
then a sender-address mismatch, then a completely separate
Confirm-signup-vs-Magic-Link template split). Both the link path and the
code path for new-user signup are confirmed working end-to-end as of
2026-09-14. The one genuinely still-open piece: whether Magic Link's own
`{{ .Token }}` (the *code* path for a *returning* user, as opposed to
clicking the link) has ever actually been typed by a human — every
success on that template so far has been via the link. Low priority,
not blocking anything.

The `handle_new_user()` trigger (already in the DB, not something to
rebuild) reads `raw_user_meta_data.signup_role`/`full_name`/`org_name`/
`terms_version` on `auth.users` insert, creates the matching `accounts`
row plus `candidates`+`candidate_contact` or `employers`+
`employer_verification_requests`, and mirrors `role` into
`raw_app_meta_data` so it's in the JWT.

---

## 7. What is built

- Cloudflare account, Worker (`icare`), CI/CD, `workers.dev` subdomain
  registered, R2 bucket (`icare`, bound as `MEDIA`).
- Supabase wired in as the real backend (D1 was removed — it was a
  placeholder from before the real backend was identified).
- Auth: OTP request/verify, logout, me.
- Candidate profile API (`src/candidates.ts`): profile CRUD (whitelisted
  fields), photo upload/download to R2, publish (via the existing
  `publish_my_profile()` RPC, gated by `can_publish()`),
  professions/skills (replace-whole-set), employment history/
  qualifications/registrations (full CRUD), DBS (singleton upsert),
  references (full CRUD), self-expression prompts (per-prompt
  upsert/delete), badges (read-only), close-account, plus onboarding
  advance/complete. Public reference routes: `/professions`, `/skills`,
  `/qualification-types`, `/prompts`.
- **Candidate onboarding wizard** (`src/onboarding.html`, Sprints 2–5):
  the full 11-step journey — basics, skills, availability, employment
  history, qualifications, registrations, DBS status/consent,
  references, self-expression prompts, photo, review & publish.
  Resumes from `onboarding_step` on load; accepts `?step=N` to jump to
  an earlier completed step (used for editing from the dashboard). On a
  genuine first visit, offers a choice screen first: upload a CV (see
  next bullet) or fill in the wizard manually.
- **CV import** (`POST/GET /candidates/me/cv*` in `src/candidates.ts`,
  the CV intro/upload/review screens in `src/onboarding.html`): upload a
  PDF → **Workers AI** (`env.AI`, no separate vendor/API key — runs on
  the same Cloudflare account, draws from its free daily Neuron
  allocation) extracts a draft → candidate reviews/edits/unchecks
  anything wrong on a dedicated screen → only then does "Apply" write
  anything, through the exact same routes manual entry uses. Two Workers
  AI calls: `env.AI.toMarkdown()` extracts text from the PDF (embedded-
  image conversion explicitly disabled, so a CV photo is never
  described/reasoned about — non-negotiable #6 applied to images too),
  then `env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", …)` with
  JSON-mode `response_format` extracts structured JSON from that text.
  **Originally built against the Claude API; switched to Workers AI
  after the founder declined the per-call cost** (2026-08-26) — see
  PROGRESS.md for the full before/after. The parse route itself never
  touches profile tables — enforces non-negotiable #5 architecturally,
  not just by prompting. Non-negotiable #6 (data minimisation) is
  enforced both in the system prompt and structurally (no field in the
  schema can carry DOB/nationality/immigration/marital/gender/religion/
  ethnicity/health/NI-number/photo data — flagged via
  `sensitive_categories_noticed` instead). **Real difference from the
  Claude version**: an open-weight model's JSON-mode isn't guaranteed to
  honor schema `enum` constraints the way Claude's forced tool-use was,
  so `sanitizeParsed()` in `src/candidates.ts` is now the actual
  guarantee — every profession/skill/qualification-type id and
  regulator the model returns is checked against the real reference
  tables and dropped if it doesn't match, regardless of what the model
  output. Verified in isolation against 10 adversarial inputs
  (hallucinated ids, malformed nested objects, non-array garbage,
  empty input) — see PROGRESS.md. No secret to provision — works as
  soon as it's deployed.
- **Candidate dashboard** (`src/dashboard.html`, Sprint 5): profile
  summary, badges (grouped by family, grade visually distinct per
  non-negotiable #2), a per-section "at a glance" list linking back
  into the wizard for edits, account closure.
- Sign-up/sign-in/verify (`src/sign-in.html`, `src/verify.html`, Sprint
  1): OTP-based, one entry point for both flows.
- **Employer sign-up/sign-in** (`src/employer-sign-in.html`,
  `src/employer-home.html`, Sprint 6): mirrors the candidate flow for
  `role: "employer"`, own purple/teal design system matching
  `employers.html`, collects an organisation name at signup. Lands on
  the new `/employer/home` stub post-verify — `handle_new_user()`
  already creates the `employers` row and an
  `employer_verification_requests` row automatically, so this needed no
  new backend routes.
- **Employer verification flow** (`src/employers.ts`, Sprint 7,
  corrected 2026-08-26): `GET /employers/me` (own row + full
  verification-request history), `POST /employers/me/verification-
  requests` (submit/re-submit). **A Companies House number is required**
  — the real minimum bar per founder decision, since not every UK care
  employer is CQC-registered (Scotland has Care Inspectorate, Northern
  Ireland has RQIA, Wales has CIW). A care regulator + registration
  number is optional supplementary evidence, required together if
  either is given. `employers.is_verified` itself is the real gate
  (`is_verified_employer()` RPC) and can only be flipped by
  `service_role` — a DB trigger enforces this, so no client path can
  self-verify even by bug. `employer-home.html` shows a real,
  data-driven verification card (4 states: none/pending/rejected/
  verified) instead of a static line, with a regulator dropdown that
  reveals a registration-number field only when a regulator is picked.
  Review stays manual via the Supabase dashboard, same as
  qualifications/registrations. A confirmation email fires on
  submission (content written, wired at the call site) — see §8 item 3
  for why it doesn't actually send yet.
- **Employer chat + candidate search** (`src/employer-chat.ts`,
  `src/employer-chat-guardrail.ts`, Sprint 8): a verified employer's home
  is a persisted chat thread (`employer_chat_messages`, RLS self-only).
  Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`, native
  function-calling — not the Claude API, see §2) translates a message
  into a `search_candidates` tool call; it never sees results, so the
  reply an employer gets is always a fixed template sentence, never
  model-generated prose about who matched. Three-layer protected-
  characteristics guardrail (structural tool schema, deterministic
  keyword/proximity check, prompt instruction) — the keyword layer's
  30-case test suite caught two real bugs before shipping, see
  PROGRESS.md. `candidate_search` (the query surface) was corrected to
  require `is_verified_employer()` (had no gate at all before Sprint 8)
  and extended with name/current job title per the founder's
  non-negotiable #4 override — photo/video/CV stay excluded, those
  columns were never added. Result cards show grade-distinct badges
  (new public `GET /badges` route).
- Landing pages: candidate-primary (`src/landing.html`) and employer
  (`src/employers.html`, v2, built against a real design/copy brief).
  Both waitlist-first pre-launch pages, not the real signed-in product.
- Waitlist: captures name/email/phone (+ `hiring_for` for employers),
  RLS-private, a real (not fabricated) live counter, honest "first 100"
  recognition-only messaging (explicitly not a paid-feature credit —
  see §1.1), on-page + email social share buttons.
- `/privacy`, `/terms` (Sprint 0): draft legal pages, explicitly marked
  DRAFT, not lawyer-reviewed.
- Welcome email: fully written (`src/emails/waitlist-welcome.ts`), not
  yet sending — see §8.
- Notifications (2026-09-15): a real notification center, candidate-side
  only — connection requests, connection acceptances, new messages, and
  shortlist/interview invites. `notifications` table + `my_notifications`
  view (migrations 0043/0044), populated by four SECURITY DEFINER
  triggers (never a direct client insert — same "the only way in" pattern
  as `get_or_create_conversation`), four routes under `/candidates/me/
  notifications`, and a header bell (`src/notifications-bell.html`,
  copy-pasted per page same as `nav-shell.html`) on all eight signed-in
  candidate pages. Invites also send email (`candidate-invite-received.ts`
  via `employer-chat.ts`'s `send_invite`) — the one event type of the four
  that does, since candidates return every few months and an in-app-only
  signal risks being missed between visits; connections/messages stay
  in-app only. Employer-side mirror (candidate responded, pipeline moved)
  is a same-shape follow-up, not built. Full design rationale and the
  narrow-viewport positioning bug found and fixed before shipping are in
  PROGRESS.md's 2026-09-15 entry.

All of the above is deployed and CI-confirmed working, **except** the
most recent commits on the open PR (see §10) which haven't had a fresh
deploy confirmation yet.

## 8. What is not built

**Blocking real usage**

1. **Custom `icare` domain** — **resolved 2026-08-28**: user purchased
   `icareltd.com` (still registered at GoDaddy, DNS moved to Cloudflare —
   nameservers confirmed live via direct NS lookup:
   `chan.ns.cloudflare.com` / `jermaine.ns.cloudflare.com`). Attached to
   the Worker via `wrangler.jsonc` `routes` (`custom_domain: true` for
   both `icareltd.com` and `www.icareltd.com`) on this branch — deploy
   confirmation still pending (see §10). `info@icareltd.com` mailboxes
   are hosted on Zoho Mail (MX/SPF/DKIM records added to the Cloudflare
   zone by the user). This unblocks: (a) Supabase Auth custom SMTP via
   Sender.net for auth emails, (b) the waitlist welcome email
   (`src/email.ts`'s `sendTransactionalEmail` is a documented no-op until
   a verified sending domain exists — Sender.net SMTP-relay work is still
   parked per §12, now unblocked on the domain side only), (c) no more
   `workers.dev` for the public-facing app. **Correction, same day**: an
   earlier note here claimed no landing page existed — wrong. `/` in
   `src/index.ts` already serves `src/landing.html`, a real
   waitlist-capture landing page (candidate-primary copy from
   `LANDING_PAGE_COPY.md`, live `GET /waitlist/count`, "coming soon" tags
   on unbuilt features). `icareltd.com` is serving this page live as of
   2026-08-28, confirmed via the successful deploy (see §10) — not the
   raw candidate app.
2. **Supabase email template fix** (`{{ .Token }}`) — see §6. Manual
   Dashboard step.
3. ~~**Sender.net API integration itself**~~ — **resolved 2026-09-02**:
   the Sender MCP connector reconnected and confirmed `icareltd.com` is
   a fully verified sending domain (SPF/DKIM/DMARC all passing at the
   time). `src/email.ts`'s `sendTransactionalEmail()` now makes a real
   `POST https://api.sender.net/v2/message/send` call (confirmed against
   Sender's own current docs, not guessed), gated on a `SENDER_API_KEY`
   Worker secret (provisioned via `wrangler secret put`, never a plain
   `wrangler.jsonc` var) plus `SENDER_FROM_EMAIL`/`SENDER_FROM_NAME`
   vars (`hello@icareltd.com` / `iCare`). Verified with a real send
   (`emailId` returned, delivered). The three stage-completion email
   templates (`src/emails/candidate-profile-published.ts`,
   `employer-verification-submitted.ts`, `employer-verified.ts`) are
   wired at their call sites as before and now actually send.
   `employer-verified.ts` **still has no trigger** — `is_verified` is
   only ever flipped by a manual Supabase dashboard edit — that's still
   open, a decision for the founder (Postgres database webhook vs. a
   real admin review route).
   **✅ Resolved 2026-09-10** (was broken, found and fixed same day):
   OTP/magic-link delivery (a *separate* path — Supabase Auth's own
   SMTP, not this route, see §6) started silently failing after working
   correctly for several days. Diagnosed live: Sender.net account/domain/recipient all
   checked healthy (not suspended, domain still `ready_to_send`,
   recipient's `temail` channel status `active`, no bounce), and even a
   **direct Sender.net API test send** (bypassing Supabase entirely)
   returned success — but never arrived, not even in spam. Root cause
   found via DNS: **two conflicting `_dmarc.icareltd.com` TXT records**
   — Sender.net's intended `v=DMARC1; p=none;` alongside a stale
   **GoDaddy default record** (`rua=mailto:dmarc_rua@onsecureserver.net`)
   left over from before DNS moved to Cloudflare. Two DMARC records at
   the same name is invalid per spec and is a known cause of Gmail
   silently discarding mail rather than spam-foldering it — matches the
   symptom exactly. No tool available here edits Cloudflare DNS records
   (only Workers/D1/KV/R2/Hyperdrive) — **the founder was given the
   exact record to delete via the Cloudflare dashboard (DNS → Records →
   `_dmarc`) and has not yet confirmed it's done or re-tested delivery.
   Pick this up first on the next session** — see PROGRESS.md's
   2026-09-10 entry for the full diagnostic trail before re-doing any of
   this work.
   **Update, same day, DMARC fix applied but not yet sufficient**: the
   founder deleted the stale GoDaddy DMARC record (confirmed via fresh
   DNS lookup — only `v=DMARC1; p=none;` remains now) and a fresh test
   OTP send was triggered. Sender.net's own delivery log shows it as
   **delivered** (SMTP accepted by Gmail) — a genuine improvement, the
   earlier direct-API test never even got that far — but it still never
   reached the inbox or spam. "Delivered" here only means Gmail's server
   accepted the SMTP handoff, not that Gmail actually surfaces it to the
   user; Gmail is known to silently accept-then-discard mail it's
   suspicious of, invisible to both Sender.net and us.
   **Real candidate root cause, founder-confirmed 2026-09-10, not yet
   applied**: the Supabase SMTP relay's configured sender address is
   **`info@icareltd.com`** — but that exact mailbox is a real, separate
   inbox hosted on **Zoho Mail** (MX/SPF/DKIM for Zoho were set up for
   it when the domain was configured, see item 1 above). Sending OTP
   mail claiming to be from that address via a *different* provider
   (Sender.net, not Zoho) is a real infrastructure mismatch, and exactly
   the kind of pattern (an address with sending history on one system
   suddenly sending from another, on a young domain, on a shared-IP free
   ESP tier) that triggers Gmail's silent-discard behavior specifically.
   **Fix applied and confirmed working**: founder changed the SMTP
   relay's "Sender email" in Supabase Dashboard → Authentication →
   Emails → SMTP Settings from `info@icareltd.com` to
   `hello@icareltd.com` — the address `email.ts`'s direct-API path
   already used successfully, with no separate real mailbox behind it.
   Re-tested the same way (`POST /auth/request-code` on staging,
   `recovery_sent_at` confirmed processed within 2 seconds) — founder
   confirmed the email arrived. OTP/magic-link delivery is working
   end-to-end again. See §2's "Email address ownership" rule — don't
   let `info@` and `hello@` blur back together.
   **STILL BROKEN for NEW signups, found 2026-09-14. The 09-10 fix only
   ever covered returning users.** Supabase Auth uses a *different email
   template per action*, and only one of the two was ever fixed:

   | Action | Template | State |
   |---|---|---|
   | `user_recovery_requested` (existing user signs in) | **Magic Link** | fixed + verified 09-10, works |
   | `user_confirmation_requested` (**new** signup) | **Confirm signup** | never touched, never tested |

   Every `{{ .Token }}` / template mention anywhere in HANDOVER.md and
   PROGRESS.md refers to the Magic Link template. "Confirm signup" appears
   nowhere in the project's history before today.

   This went unnoticed for four days because **no new-user signup was
   attempted between the 09-10 relay change and 09-14**. Every confirmed
   account in `auth.users` (08-31, 09-02 x2) predates the change; the
   first signup after it (`mariamoniquemurillo@gmail.com`, 09-14 06:56
   UTC) never arrived and never confirmed.

   What the evidence rules OUT — don't re-diagnose these:
   - Not the send: `POST /otp` returned 200 in 1.82s, no error,
     `confirmation_sent_at` stamped, `one_time_tokens` row created.
   - Not the domain: Sender.net reports `icareltd.com` verified with SPF,
     DKIM **and** DMARC all passing, `ready_to_send: true`. The 09-10
     DMARC-class failure has not returned.
   - Not the relay: a Magic Link OTP to `mjm.refugio@gmail.com` at
     07:58:09 the same morning produced a successful login at 07:58:22 —
     13 seconds, same relay, same sending domain, same recipient domain.

   **Two independent bugs sit on the signup path**, and fixing delivery
   alone leaves the second one live:
   1. *Delivery.* Supabase's default Confirm-signup template leads with a
      raw `supabase.co` link — a much stronger spam signal than a plain
      numeric code on a young domain via a shared-IP free ESP tier.
   2. *Unusable even when delivered.* The default template contains
      `{{ .ConfirmationURL }}` and **no `{{ .Token }}`**, but `/verify`
      presents an 8-digit code box. A new user would get an email with no
      code in it.

   A ready-to-paste replacement that fixes both is checked in at
   `docs/email-templates/supabase-confirm-signup.html`. **Keep it in sync
   with the Magic Link template** — if one changes and the other doesn't,
   new signups and returning sign-ins drift apart again, which is exactly
   how this happened.

   **The decisive test not yet run** (needs dashboard access): Sender.net's
   activity log for 09-14 06:56 UTC. No record there ⇒ the failure is
   Supabase-side and the template is the cause. "Delivered" there ⇒
   Sender.net handed it to Gmail and Gmail silently discarded it, in which
   case the durable fix is to stop using Supabase's email layer for auth
   entirely: mint the token with the admin `generateLink` API and send it
   through `src/email.ts` / `src/emails/` on the Sender.net **API** path
   that already works for waitlist and profile mail (needs a service-role
   key as a Worker secret).

   **Update, same day — founder confirmed the email DID arrive, which
   answers the decisive test above without needing the Sender.net log:**
   delivery is fine. It confirmed the *other* half of the two-bug
   diagnosis above (point 2 — no `{{ .Token }}` in the template) and
   surfaced a **third, separate bug** that the diagnosis above didn't
   anticipate: the link in the email doesn't land on `/verify` at all —
   it lands on **`/sign-in`**, which just shows the plain "enter your
   email" form again. Confirmed by the founder for both the original
   signup email and the resend triggered from `/sign-in`'s own "send
   code" button — same dead end both times.

   **Root cause, found by reading `verify.html`'s own logic, not
   guessed:** GoTrue always appends `#access_token=...&refresh_token=...`
   to wherever it resolves the link to (see the Sprint 24 comment in
   `landing.html`) — but which page that is depends on the Dashboard's
   Site URL / Redirect URLs allow-list, which nothing in this codebase
   controls or can inspect. When that resolves to `/sign-in` instead of
   `/verify`, the hash just sits there unread, and `verify.html`'s own
   `if (!email) { window.location.href = signInPath; }` fallback (for
   when it's opened with neither a hash nor a `?email=` query string)
   doesn't even apply here — the hash never gets *to* verify.html at all,
   because `sign-in.html` had no code to forward it there in the first
   place. `landing.html` got this exact fix in Sprint 24, precisely
   because it was then the known fallback target — but `sign-in.html`,
   `employer-sign-in.html` and `employers.html` never did, because
   nobody had reason to think the fallback would ever land anywhere but
   `/`.

   **Fixed 2026-09-14 (later same day):** the identical hash-recovery
   script from `landing.html` is now the first thing in `<head>` on
   `sign-in.html`, `employer-sign-in.html` and `employers.html` too —
   every public page a signed-out visitor could plausibly land on.
   Deliberately not narrowed to "just fix whichever page the Dashboard
   currently falls back to" — that setting isn't visible or controllable
   from this codebase, so the only version of this fix that survives the
   Dashboard drifting again is putting the recovery script everywhere a
   drift could land, exactly the reasoning the original Sprint 24 comment
   already stated. **Verified in a real Chromium**, not just read: served
   the three pages locally, navigated to each with a synthetic
   `#access_token=` hash attached, and confirmed the navigation trail
   passes through `/verify` with the hash intact on all three — the fake
   token then fails cleanly against `/auth/verify-code` with `verify.html`'s
   own existing error message, exactly as a real expired/reused token
   would, with no JS error either way.

   **RESOLVED, same day — founder pasted `docs/email-templates/supabase-
   confirm-signup.html` into Dashboard → Authentication → Emails →
   Confirm signup, then verified with a genuinely fresh signup (a
   `+`-tagged Gmail alias, never seen by Supabase before): the email
   arrived with a visible code, and typing it in completed sign-in
   successfully.** New-user signup is now confirmed working end-to-end
   on both paths — click the link (fixed earlier the same day, the
   `/sign-in` dead-end) or type the code (this template). The whole
   09-14 signup saga — delivery, the missing token, the dead-end
   redirect — is closed.

   **Still open, lower priority:** whether "Magic Link" (the returning-
   user template) has the same missing-`{{ .Token }}` gap is unconfirmed
   — every success on that template so far (`mjm.refugio@`, 09-14) has
   been via the link, never by a human typing a code from it. Worth a
   similar fresh-alias check next time someone touches auth, but it's
   not blocking anything today.

   **Process gap worth closing:** nothing currently surfaces failing
   signups. An unconfirmed-signup check, or simply running one real
   signup from a clean address after any auth change, would have caught
   this on day one instead of day four.


**Next, no particular blocker**

4. ~~Employer-side API (profile, verification-request flow, browsing
   published candidates)~~ — Sprints 6-8 shipped sign-up/sign-in,
   verification, and chat-based search (`candidate_search`, corrected to
   exclude photo/video/CV pre-shortlist per non-negotiable #4 — name/
   current job title/location are shown, per the dated founder
   override in §1). **Shortlisting itself (Sprint 9) is what's left** —
   an employer can find candidates via chat but can't yet act on a
   result.
5. ~~CV import~~ — built during the post-Sprint-5 review pause (upload →
   Workers AI parse → candidate review/edit → apply), see §7. **No
   blocker** — runs on Workers AI (`env.AI`), the same Cloudflare
   account already in use, no separate secret to provision. (Originally
   built against the Claude API and blocked on `ANTHROPIC_API_KEY`;
   switched after the founder declined the cost — see PROGRESS.md.)
6. Candidate self-expression posts (with per-post, revocable, opt-in
   consent gating what's employer-visible) + employer conversational AI
   search (natural language, descriptive-not-evaluative, with a
   protected-characteristics guardrail that needs real design work, not
   just a prompt instruction) — explicitly phase 2 per the product brief.
7. ~~`/privacy` and `/terms` pages~~ — built (Sprint 0), explicitly
   marked DRAFT, not lawyer-reviewed.
8. ~~A real signed-in app UI (dashboard, profile editor)~~ — built: the
   full 11-step onboarding wizard (Sprints 2–5) and the real candidate
   dashboard (Sprint 5, `src/dashboard.html`). Candidate track complete.
9. ~~Employer-facing landing page~~ — built and merged (`GET /employers`,
   PR #11, deploy run #12); then rebuilt as v2 against the user's actual
   design/copy brief (much richer than v1 — see PROGRESS.md's "Done"
   section for detail and the fixes made against the draft). **That
   brief reveals the real employer product is chat-first AI search + a
   built-in ATS + an "iCompliance" module + AI interview parsing — not
   the simple structured-field search assumed elsewhere in this doc and
   in `SPRINTS.md`.** Treat `SPRINTS.md`'s employer track as stale until
   it's revised against this — it has been (see §13).
10. ~~Launched-state marketing landing page with real Log In / Sign Up
    entry points~~ — **done 2026-09-14: `/` *is* that page now.**
    Two-step history worth keeping, because the first step was
    deliberately reversed. On 2026-09-10 this shipped as a *separate*
    page at `/welcome`, because the user's explicit call at the time was
    to keep `/` as the pre-launch waitlist page. On 2026-09-14 the user
    supplied a market-research handover and asked for `/` itself to be
    rebuilt from it — so `src/landing.html` was rewritten as the real
    launched-state page, `src/welcome.html` was deleted, and `/welcome`
    now 302s to `/`. **The waitlist capture form is no longer on `/`.**
    `POST /waitlist` and `GET /waitlist/count` still exist and still
    work, and the employer page (`/employers`) still has its own
    waitlist form — only the candidate-side form is gone, replaced by
    Create-your-profile / Log in. If candidate waitlist capture is ever
    wanted again it needs a deliberate decision about where it lives,
    because `/` is now a login-first page.

---

## 9. Product-direction notes (from a copy/design brief, treat as roadmap)

Phase 2, not built, but shapes what "not evaluative AI" and "consent
gating" need to look like when they are: candidates will be able to post
freely (not just structured fields), with **per-post, revocable consent**
controlling whether a post is private, visible to other candidates, or
included in the employer-facing AI search pool — default most
restrictive, inclusion always opt-in. Employers get a natural-language
search interface over that consented content; see non-negotiable #5 for
the hard constraints this must respect.

---

## 10. Conventions specific to this repo

- **Branch workflow**: after each PR merges (squash), reset the dev
  branch from `origin/main` before the next change
  (`git fetch origin main && git checkout -B <branch> origin/main`) —
  the squash-merged commit has a different SHA than what's local, so
  reusing the old branch tip causes divergence.
- **Every code change**: `npm run typecheck` (must pass) and
  `npx wrangler deploy --dry-run --outdir=<tmp>` (validates bundling,
  catches things `tsc` alone won't — e.g. the `.html` text-import rule)
  before pushing.
- **`wrangler.jsonc` quirks worth knowing**: `wranglerVersion: "4"` is
  pinned in `deploy.yml`'s `cloudflare/wrangler-action` step because it
  defaults to Wrangler 3.x, which conflicts with
  `@cloudflare/workers-types@^5`; the runner needs Node 22 (Wrangler 4
  requires it). Both already fixed, just explaining why they're there so
  nobody "simplifies" them back.
- **`requireAuth` middleware** (`src/middleware.ts`) is the pattern for
  any new authenticated route — attaches an RLS-scoped Supabase client
  (forwards the caller's own bearer token, never `service_role`) plus
  `userId`/`user` to Hono context. Reuse it; don't hand-roll token
  parsing again.
- **`PROGRESS.md` discipline** (enforced via `AGENTS.md`/`CLAUDE.md`):
  read it first, update it before ending a session. This handover doc
  doesn't replace that habit — keep both current.

---

## 11. Gotchas

- Cloudflare account-scoped tool calls need `account_id` passed
  explicitly even when a tool's declared schema doesn't show the
  parameter — pass it anyway, it works.
- `workers.dev` subdomain registration is a one-time manual Dashboard
  step (Workers & Pages → set up your subdomain), no API path exists.
- Supabase's free tier caps a org at 2 *active* projects — this org is
  already at that cap with `Meridian Project` and `care-register` (the
  third, `rah-caregiver-portal`, is paused).
- `claude.ai/share/*` links are **not reachable** from this sandbox
  (network egress policy resets the connection even through the
  configured proxy) — only `claude.ai/code/artifact/*` URLs are
  fetchable. If a shared conversation link needs reading, ask the user to
  export/paste it or upload the file directly.
- The Cloudflare Developer Platform MCP connector in this environment can
  see a second, unrelated Cloudflare account — always double check
  `account_id` before creating/deleting resources.

---

## 12. Open questions for the founder

- ~~`icare` domain — not yet purchased/chosen~~ — resolved 2026-08-28:
  `icareltd.com` purchased, DNS moved to Cloudflare, Custom Domain routes
  added to `wrangler.jsonc`. See §8 item 1.
- ~~Marketing landing page vs. straight-into-app on `icareltd.com`~~ —
  moot, corrected 2026-08-28: a real landing page (`src/landing.html`)
  already exists and is already what `/` serves. No decision needed.
- **Sender.net vs an alternative** for transactional email — decided in
  principle (Sender.net, as SMTP relay behind Supabase Auth for auth
  emails; direct API for stage-completion emails), not yet executed. See
  §8 item 3 — the actual send call is still blocked on reaching
  Sender.net's docs/account at all — the domain blocker is now cleared,
  the Sender.net API-access blocker is not.
- **Multi-vertical brand architecture** (iRecruit as B2B umbrella +
  candidate-facing verticals iCare/iBuilt/iHost/iFinance/iTech-or-iCode/
  iLaw/iTeach, each on its own proper domain, not a subdomain) — decided
  in a 2026-08-27 strategy session, not yet merged in full detail into
  this document. Confirms **no job postings will ever exist** (see the
  employer chat/`search_candidates` architecture in §2/§4, which already
  matches this). Also confirmed: candidates can never pay for
  ranking/visibility (Employment Agencies Act 1973) — an "Analytics tier"
  (viewer identity, search-appearance counts, comparative benchmarking
  framed as improvement score not ranking, skills-gap insight, saved
  search alerts) was selected as the priority B2C paid feature, not yet
  built. Parent/holding company name (must include "work") and the tech
  vertical's final name (iTech vs. iCode) are still undecided.
- ~~Whether to mirror Supabase migrations as files in this repo~~ —
  resolved 2026-08-26: yes, done. See §4.
- ~~What "verified employer" actually requires~~ — resolved 2026-08-26,
  founder decision: a Companies House number (proof of being a genuine
  UK-registered company) is the real minimum bar and is now required to
  submit for verification; a care-regulator registration (CQC/Care
  Inspectorate Scotland/RQIA/CIW) is optional supplementary evidence,
  since not every UK care employer has one. See §7's employer
  verification entry and `SPRINTS.md` Sprint 7's correction note.
- **Not the same question, still open**: whether *iCare itself* needs
  Northern Ireland agency licensing to operate there (carried over from
  the original Next.js build's handover, entity not yet incorporated).
  Don't conflate this with the now-resolved employer-verification
  question above — the founder's "not inclined to waste time on agency
  licensing for Northern Ireland" comment was about what iCare requires
  *of employers* during verification, not about iCare's own regulatory
  status, which remains genuinely unresolved.
- Carried over from the original Next.js build's handover, still
  unresolved: retention period on closed accounts (`purge_after`
  currently defaults to 12 months, needs legal confirmation), two-factor
  auth for employers (deferred until there are real shortlists).

---

## 13. Immediate next step (updated 2026-08-25, post-hand-off)

**Done since this doc was written**: PR #9 merged and deployed. The
UI-fluidity check this section used to flag is also done — actually
rendered the landing page at 6 real viewport sizes via headless Chromium
(not just read the CSS) and fixed two real problems: the hero's
absolutely-positioned card stack (previously the most layout-fragile part
of the page, flagged here) is now one naturally-flowing card with no
per-breakpoint overrides, and the feature grid now uses the available
width on larger screens instead of always single-column. No horizontal
overflow at any tested size, before or after. The user then supplied a
real photo for that hero card's illustrative profile; it's cropped to a
52px circular avatar, embedded as a base64 data URI (still a single
self-contained landing.html, no new asset route), and the card's
name/role text was updated to match the badge visible in the photo
("Emily R." / "Healthcare Assistant · Belfast"). Both changes shipped on
PR #10, which the user approved merging — squash-merged to `main`, deploy
run #11 succeeded. Both are live.

The user then explicitly parked the custom-domain/Sender.net work ("will
buy the domain in a few days time so let's park this for now") and asked
for the employer-facing landing page instead (§8 item 10). That's now
built — `GET /employers`, same design system as the candidate page,
separate employer waitlist pool (migration `0009_waitlist_employer_role`).
See PROGRESS.md's "Done" section for full detail. Shipped on PR #11,
which the user approved merging — squash-merged to `main`, deploy run
#12 succeeded. Live.

The user asked to move from waitlist-only to the actual platform,
candidate journey first then employer, and `SPRINTS.md` was written for
that. **Before Sprint 0 started**, the user uploaded a real design +
copy brief for a v2 employer landing page — built, see PROGRESS.md's
"Done" section for the fixes made against the draft (a fake-stats
counter, an evaluative-language slip against the brief's own compliance
note, a missing-id nav bug, an unvetted hotlinked photo, feature-list
drift between the two uploaded files). More importantly, that brief
reveals the real employer product is chat-first AI search + a built-in
ATS + an "iCompliance" module + AI-parsed video interviews —**not** the
simple structured-field search `SPRINTS.md`'s employer track (Sprints
6–10) was written against.

That revision pass happened next — the user chose, explicitly: **chat is
the primary employer interface from day one** (not a fast-follow layer),
**pipeline stages are fixed** (Shortlisted/Interview/Offer/Hired) not
per-employer configurable, **AI-parsed video interviews are a separate,
later initiative** (not in this track), and **iCompliance is real and
scoped** (an employer's own compliance checklist/workflow per hire) **but
explicitly not urgent** — captured as Sprint 12, don't start it
unprompted. `SPRINTS.md`'s employer track (now Sprints 6–11, plus 12
unscheduled) reflects all of this.

**⚠️ Correction, stale as of 2026-08-26**: this paragraph used to say
pre-shortlist search results "must stay fully anonymous." That's no
longer accurate — see §1 non-negotiable #4's dated annotation. The user
explicitly instructed candidate name, current job title, and location to
be shown pre-shortlist; only photo/video/CV stay gated. Don't rely on
this paragraph's history for current behavior — §1 is the source of
truth.

Sprint 0 is now shipped: `/privacy` + `/terms` pages (self-contained,
explicitly marked DRAFT, grounded in real system behavior including the
#4 override rather than idealised boilerplate) and the shared
`src/auth-client.js` reference helper. The Magic Link template fix is
confirmed still-manual (checked the actual Supabase MCP tool list, no
tool touches Auth email config). See PROGRESS.md's "Done" section.

Sprint 1 (candidate sign-up/sign-in UI) is also now shipped:
`src/sign-in.html` (one file, mounted at `/sign-up` and `/sign-in`),
`src/verify.html`, and two new stub pages (`src/onboarding.html`,
`src/dashboard.html`) as non-broken redirect targets until Sprints 2 and
5 build the real thing. All call the existing, unmodified `/auth/*` and
`/candidates/me` routes — no backend changes. A real bug was found and
fixed during testing: `history.replaceState` threw uncaught inside the
sign-up/sign-in mode toggle, silently aborting the rest of the page's
init script (so the toggle's click handlers never attached, no visible
error) — now wrapped in try/catch. See PROGRESS.md's "Done" section for
full detail, including what could and couldn't be tested (a live OTP
round-trip still isn't testable from this sandbox — confirmed again via
a direct `curl` to `*.supabase.co`, not just `wrangler dev` — same
pre-existing limitation, not new).

Sprint 2 (onboarding wizard shell + core profile) is also now shipped:
`src/onboarding.html` replaced the Sprint 1 stub with a real 3-step
wizard (basics, skills, availability), backed by two new routes in
`src/candidates.ts` (`onboarding/advance`, `onboarding/complete` — the
latter deliberately not called yet, since the wizard continues through
Sprints 3–5 and `onboarding_done` shouldn't flip true until all of it
exists). Since this sandbox can't reach Supabase, verification here went
beyond typecheck/bundle/audit: exercised the actual wizard JS with
headless Chromium and mocked API responses to confirm the step flow, a
conditional field, and resume-from-a-later-step all genuinely work, not
just look plausible. See PROGRESS.md's "Done" section for full detail.

All of the above (employer landing page v2, `SPRINTS.md`, the
non-negotiable #4 override annotation, and Sprints 0-2) shipped on
**PR #12**, which the user approved merging — `mergeable_state` confirmed
`clean`, squash-merged into `main`, deploy run #13
(https://github.com/genesysc/icare/actions/runs/32938882643) succeeded.
Live. Branch restarted from `main` per convention (§10).

Sprint 3 (work history, qualifications, registrations) is also now
shipped: the wizard grew from 3 real steps + a holding screen to 6 +
holding. Employment history reused the existing full-CRUD API outright
with a new add/edit/delete UI; qualifications and registrations got
brand-new CRUD routes in `src/candidates.ts` (plus an evidence-upload
route to R2 for qualifications) and a new public
`GET /qualification-types` reference route, all RLS-checked directly
against `pg_policies` first. One correction worth knowing: a new
qualification's `status` actually defaults to `none` in the real
schema, not `submitted` as `SPRINTS.md` originally assumed — it only
becomes `submitted` once evidence is genuinely uploaded (now corrected
in `SPRINTS.md`). Two real responsive-layout bugs were found and fixed
during testing (a step-label overflow at narrow widths, and a
record-card action/title overlap) — see PROGRESS.md's "Done" section
for full detail on both.

All of the above (Sprint 3) shipped on **PR #13**, which the user
approved merging — `mergeable_state` confirmed `clean`, squash-merged
into `main`, deploy run #14
(https://github.com/genesysc/icare/actions/runs/32941646689) succeeded.
Live. Branch restarted from `main` per convention (§10).

Sprint 4 (DBS status/consent, references, self-expression prompts) is
also now shipped: the wizard grew from 6 real steps + a holding screen
to 9 + holding. DBS is a true upsert (`dbs_records.candidate_id` is the
primary key, checked directly against the schema) with
`consent_given_at` stamped server-side only on the first `true` — never
client-supplied. References reuse the Sprint 3 record-card CRUD
pattern; the referee-response flow itself stays deferred, still blocked
on the parked domain/Sender.net work. Prompts are a new
`(candidate_id, prompt_id)` upsert/delete against the 6 real prompts
already seeded in the DB. All RLS-checked directly against
`pg_policies` first. The per-step label row (patched once already in
Sprint 3) was replaced outright with a single dynamic "Step X of 9 ·
Label" line, since it would have needed a third patch at 9 labels —
this removes that whole bug class instead of re-fixing it. See
PROGRESS.md's "Done" section for full detail. Not yet merged.

Sprint 5 (photo, review, publish, real candidate dashboard) is also now
shipped — **the candidate track is complete.** Read
`publish_my_profile()`'s and `can_publish()`'s actual SQL before
building against them, which surfaced two things neither `SPRINTS.md`
nor this doc previously knew: publishing itself sets `onboarding_done =
true` (the dedicated `onboarding/complete` route from Sprint 2 stays
permanently unused by design — publish *is* the completion signal), and
publishing is gated on 4 specific conditions (profession, employment
history, postcode, right-to-work ≠ `not_stated`), returning `published:
false` rather than an error if unmet. The review step mirrors those
exact conditions for an honest "still needed" checklist and computes
completeness using the DB's own 8-factor weights, read first not
guessed. A new `GET /candidates/me/photo` route had to be added — there
was no way to get an uploaded photo's bytes back before this. The new
dashboard (`src/dashboard.html`) is view-only for individual fields by
design — "Edit" links reuse the wizard via a new `?step=N` override
rather than duplicating every form a second time. Badges render with a
genuinely distinct visual treatment per grade per non-negotiable #2.
Account closure wraps the existing `close_my_account()` RPC behind a
two-step in-page confirm. See PROGRESS.md's "Done" section for full
detail.

All of the above (Sprint 5) shipped on **PR #14**, which the user
approved merging — `mergeable_state` confirmed `clean`, squash-merged
into `main`, deploy run #15
(https://github.com/genesysc/icare/actions/runs/32966651915) succeeded.
Live. Branch restarted from `main` per convention (§10). **The
candidate track is complete end to end, in production**: sign up →
verify → 11-step wizard → publish → real dashboard.

The user then paused sprint work to review the full candidate journey's
UI and copy — see PROGRESS.md's "Candidate-side UI/copy review pass" and
"CV import" entries for full detail. Three things came out of that
review: the professions picker was rebuilt as a grouped dropdown +
removable chips (data was already broad — 28 professions, 6 families —
the checkbox grid was just presenting it narrowly); the DBS step gained
a live preview line stating the exact non-negotiable #3 phrase as the
candidate fills it in; and CV import — a feature requested at the very
start of onboarding planning — was built: PDF upload → an LLM extracts
a draft → a fully editable review screen → apply, with non-negotiables
#5 and #6 enforced architecturally (the parse route never writes to
profile tables; the extraction schema has no field that could carry
sensitive personal data). All three fixes verified with headless
Chromium + a 5-viewport overflow audit; not yet pushed as a PR (folding
into the next sprint's PR unless asked to ship separately).

**⚠️ Switched off the Claude API, 2026-08-26 — founder declined the
per-call cost.** CV import was originally built against the Claude API
(`claude-opus-5`, forced tool use). When told this wasn't free, the
founder asked for a genuinely free alternative rather than a cheaper
metered one, and picked **Cloudflare Workers AI** from three options
presented (the others: Google Gemini's free tier, or no LLM at all).
Rebuilt against `env.AI` — no separate vendor/API key, runs on the
Cloudflare account already in use, draws from its free daily Neuron
allocation (10,000/day). Two calls replace the single Claude call:
`env.AI.toMarkdown()` extracts text from the PDF (with embedded-image
conversion explicitly turned off, so a CV photo is never described —
non-negotiable #6 applied to images too), then
`env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", …)` with
JSON-mode extracts the structured draft from that text. **The one real
trade-off**: Claude's forced tool-use with a strict schema guaranteed
every returned id was real; an open-weight model's JSON mode doesn't
give that guarantee, so a new `sanitizeParsed()` function in
`src/candidates.ts` now does it explicitly — every id/regulator the
model returns is checked against the live reference tables and dropped
if invalid. Verified against 10 adversarial inputs in isolation
(hallucinated ids, malformed nested objects, garbage types, empty
input) — all pass. No secret to provision; works as soon as it's
deployed. See PROGRESS.md's "Done" section for full detail.

Sprint 6 (employer sign-up/sign-in UI) is now shipped — **the employer
track has started.** `src/employer-sign-in.html` (own purple/teal design
system, mirrors the candidate sign-in pattern, collects an organisation
name at signup) and a new `src/employer-home.html` stub (the employer
equivalent of Sprint 1's onboarding/dashboard stubs) round out the flow;
`src/verify.html` is now shared by both audiences, branching the
post-verify redirect on the account's real role from the existing
`GET /auth/me` rather than duplicating the whole verification page.
Reading `handle_new_user()`'s real SQL first (not assumed) showed it
already creates both the `employers` row and an
`employer_verification_requests` row automatically on employer
signup — so this sprint needed zero new backend routes, and Sprint 7's
job is reviewing/completing that request, not creating it. The
`/employers` marketing page itself is untouched, same as the candidate
landing page was left unlinked to `/sign-in` after Sprint 1 — pre-launch
marketing and the real signed-in product stay separate for now. See
PROGRESS.md's "Done" section for full detail, including how redirects
were verified given `file://`'s navigation limitation in this sandbox.
Not yet pushed as a PR.

All of the above (professions/DBS fixes, CV import, Sprint 6) shipped
on **PR #15**, which the user asked to be opened and merged —
`mergeable_state` confirmed `clean`, squash-merged into `main`, deploy
run #16 (https://github.com/genesysc/icare/actions/runs/33000995853)
confirmed `success`. Live. Branch restarted from `main` per convention.

Sprint 7 (employer verification flow) is now shipped. New
`src/employers.ts` (`GET /employers/me`, `POST /employers/me/
verification-requests`) and a real verification card in
`employer-home.html` replacing Sprint 6's static line — four states
(no identifier yet / submitted-under-review / rejected with reviewer
note / verified), matching the real `evidence_status` enum lifecycle.
Reading `lock_employer_verification()`'s real SQL first confirmed
`employers.is_verified` can only ever be flipped by `service_role` — no
client code path, even a bug in this route, can self-verify an
employer. `employer_verification_requests` is append-only by RLS (no
UPDATE policy), so each (re)submission is a new audit row rather than
an edit — the route's design follows that directly rather than fighting
it. See PROGRESS.md's "Done" section for full detail, including a
`PATCH /employers/me` route that was drafted then deliberately removed
before committing since nothing used it.

All of the above (Sprint 7 + the CV-import Workers AI switch) shipped
on **PR #16**, which the user asked to be merged — `mergeable_state`
confirmed `clean`, squash-merged into `main`, deploy run #17
(https://github.com/genesysc/icare/actions/runs/33004189020) confirmed
`success`. Live. Branch restarted from `main` per convention.

**CQC verification is currently fully manual, by design** — asked
about directly and worth being explicit here: `POST /employers/me/
verification-requests` only ever creates a `submitted` audit row, it
never checks the CQC provider ID against anything. `employers.
is_verified` stays `false` until someone with database access checks
the CQC register themselves and flips it via `service_role` (no admin
UI exists for this yet — a raw Supabase dashboard edit). CQC is
believed to publish a public "Syndication API" for looking up a
provider's registration status, but this has **not been verified**
in any session (no live web access to confirm the current endpoint/
terms) — do not build against it from training-knowledge recall alone;
research it properly first if/when the founder asks for automated
verification.

Three more things landed the same day (2026-08-26), from a founder
follow-up message, not yet pushed as a PR:

1. **Supabase migrations mirrored to the repo** — `supabase/migrations/`
   now has all 12 real migrations as files, fetched verbatim from
   `supabase_migrations.schema_migrations`. See §4.
2. **Employer verification corrected to multi-regulator** — Companies
   House number is now required (the real minimum bar per founder
   decision); CQC/Care Inspectorate Scotland/RQIA/CIW is optional
   supplementary evidence. Migration `0012`. See §7 and §12.
3. **Stage-completion email templates written and wired** (candidate
   profile published, employer verification submitted, employer
   verified) — sending itself stays blocked; see §8 item 3 for the two
   real blockers hit trying to unblock it this session (Sender MCP
   disconnected, `WebFetch` egress-blocked to sender.net).

Sprint 8 (chat infrastructure + candidate search) is now shipped, on
the user's direct instruction to start it — **the employer track's
foundation is in place.** Built on Workers AI throughout, per the
standing cost preference above, not the Claude API `SPRINTS.md`
originally specced. A verified employer's home is a persisted chat
thread (`employer_chat_messages`); the model only ever produces a
`search_candidates` tool call and never sees results, so the reply is
always a fixed template sentence, never model-generated prose about
who matched — that's non-negotiable #5 by construction. The
protected-characteristics guardrail is three independent layers
(structural tool schema, a deterministic keyword/proximity check, a
prompt instruction) — the middle layer's 30-case test suite caught two
real bugs before they shipped (a strict-adjacency match letting
"female care staff preferred" through, then an over-broad fix
false-blocking "experience working with young people" — standard
care-sector language about the client population, not the candidate).
While rebuilding `candidate_search` to add the founder's non-negotiable
#4 fields (name, current job title), also found and fixed a real
pre-existing gap: the view had **no verification gate at all** —
before this migration, any authenticated role able to query it saw
every published candidate regardless of `is_verified_employer()`,
latent only because no employer search UI existed yet to exploit it.
See PROGRESS.md's "Done" section for full detail, including a third
real bug (`loadChatHistory()` missing a `.catch()`) caught by re-running
the Sprint 7 test suite after this sprint's layout changes.

Same day, following a founder question about how a candidate's
self-authored posts (opinions, stories, experiences — "the totality of
their identity") would factor into employer search, **candidate posts
shipped** too — migration `0015`, `src/candidates.ts` (`/me/posts`
CRUD), `src/employers.ts` (`/posts/:id/report`), and an extension to
Sprint 8's `employer-chat.ts` (`post_topic` field + a new stage 3:
one isolated Workers AI call per matched candidate, that candidate's
post text only, never another's, never a comparison — same
"descriptive not evaluative" argument as the rest of Sprint 8, just
applied to free text instead of structured fields). **This explicitly
supersedes** the original per-post-consent brief in PROGRESS.md
("Product direction" — private/candidates-only/employer-searchable,
default private, opt-in): posts are now open by default, immediately
employer-searchable on publish, no consent gate. Confirmed directly
with the founder before building (asked via AskUserQuestion, given the
conflict with an already-documented spec) — not a silent judgment
call, same as the CQC→multi-regulator correction earlier this day.
Moderation is report-then-manual (`flag_candidate_post()` RPC +
existing manual-review-via-dashboard pattern), matching how
qualifications/registrations/employer verification already work here —
no new admin tooling built for it.

Same day, following a founder walkthrough of the intended search →
shortlist → pipeline flow (including two new filter examples — years of
experience, NVQ/Diploma level), **Sprint 9 shipped too (partial)**:
`shortlist_candidates`, `move_candidate_stage`, and `get_pipeline_status`
chat tools (migration `0016` adds `shortlists.stage`), plus a read-only
"iRecruit" pipeline card on `employer-home.html`. "Shortlist 10 of them"
takes the first 10 from the most recent search results, in the order
returned — confirmed directly with the founder that this must be a
neutral, non-evaluative rule (not "the AI's best 10"), same non-negotiable
#5 discipline as the rest of the employer chat.

Same day, on direct founder instruction ("run the remaining sprints"),
**Sprint 9's remainder, Sprint 10, and Sprint 11 all shipped too** —
closing out the employer track in `SPRINTS.md` short of only Sprint 12
(iCompliance, explicitly not scheduled) and video interviews (a separate
later initiative). The candidate-side consent flow (`set_shortlist_
consent()` RPC + `/me/shortlists*` routes + a new "Employer interest"
card on `dashboard.html`) unlocks consent-gated employer routes for
photo/video/CV (`GET /employers/candidates/:id/{photo,video,cv}`), wired
into the iRecruit card. Sprint 10's `who_is_summary` — flagged in
`SPRINTS.md` as "the sharpest edge of non-negotiable #5" — got two
independent controls, not one: the system prompt, and a new deterministic
`containsEvaluativeLanguage()` output-side scan that falls back to a
template-built summary if the model's own output trips it. Sprint 11
added `bulk_move_stage` (deterministic stage + optional recency filter,
same non-evaluative-selection principle as `shortlist_candidates`) and a
small read-only org-profile block on `employer-home.html` — the only
genuinely missing "dashboard" piece, since pipeline/shortlists were
already the same thing Sprint 9's iRecruit card already covered.

**Next priorities**: the employer track is now feature-complete per
`SPRINTS.md` short of Sprint 12/video interviews, both deliberately
unscheduled — don't start either without the user asking. Also still
open: the live OTP sign-in flow was being debugged with the founder when
this work started (Supabase's default "Magic Link" email template has no
`{{ .Token }}`, and template editing may be gated behind having custom
SMTP configured — the founder was mid-setup with a Brevo relay borrowed
from an unrelated existing account, "Right at Home Enfield," pending a
dedicated iCare sender). Don't restart the domain/Sender.net work unless
the user brings it back up — though reconnecting the Sender MCP connector
would unblock the Sender.net API integration (§8 item 3) without touching
the domain question at all.

As always: check current branch/PR state before assuming anything in
this doc is deployed to `main`.

---

## 14. Group strategy, revised B2B workflow spec & Next.js reference track — uploaded 2026-08-30, reconciliation needed before employer-track work continues

The founder uploaded four documents this session, now stored under `docs/`
(not wired into the live Worker — reference material only):

- `docs/iCare_Group_Strategy_Handover.md` — brand architecture + B2B/B2C
  pricing, dated 27 Aug 2026.
- `docs/iCare_B2B_Recruitment_Workflow_Handover.md` — already existed in
  the repo (added on a prior PR); confirmed unchanged.
- `docs/iCare_NextJS_Candidate_Track_Handover.md` — a fuller, more current
  handover for the **separate Next.js candidate-side build** referenced
  elsewhere in this doc (§1, §3's "architecture note"). Supersedes the
  fragments of that build previously summarised here.
- `docs/mockups/jobseeker-wireframes.html` and
  `docs/mockups/employer-wireframes.html` — the click-through wireframes
  the Next.js track and the workflow spec were designed against.
- `docs/icare-jobseeker-app-code/icare-jobseeker-app/` — the actual
  Next.js/Tailwind source for the candidate side (28 files: `lib/types.ts`,
  `app/*/page.tsx`, `components/**/*.tsx`), pushed straight to `main` by
  the founder outside any PR. Wireframe-fidelity, mock-data-only, no
  Supabase wiring, no auth — a UI/logic reference, not a runnable app
  (`layout.tsx`, `package.json`, etc. weren't included). Onboarding step 3
  is the only fully-built step; steps 1/2/4–7 are placeholders.

**Why this matters:** these describe the *same product* this repo
(Cloudflare Workers) is building, but the candidate-side has now been
built twice in two different stacks, and the employer-side workflow spec
here is **materially different** from what Sprints 6–11 already shipped
in this repo. Nothing below is broken — both are internally consistent —
but they don't agree with each other, and only the founder can say which
is authoritative going forward.

### Group strategy — summary (full detail in the stored file)

- **Brand architecture**: iRecruit becomes the single B2B/employer brand
  across verticals; iCare is the health & social care candidate-facing
  vertical (current build), with iBuilt/iHost/iFinance/iTech-or-iCode/
  iLaw/iTeach as future verticals, each its own domain. Parent/holding
  company name (must include "work") still undecided.
- **B2C**: paid visibility/ranking boosts confirmed **blocked pending legal
  review** (Employment Agencies Act 1973) — consistent with non-negotiable
  #1 above. An **analytics tier** (viewer identity, search-appearance
  counts, comparative benchmarking framed as improvement not ranking,
  skills-gap insight, saved-search alerts) was selected as the priority
  paid feature — not built. Pricing: ~£5–£10/mo or a £4.99/7-day burst
  pass.
- **B2B pricing — finalised for two of three segments** (not yet built
  anywhere, no pricing page exists):
  - **In-house teams**: flat tiers gated by *concurrent active pipelines*
    (not seats, not search volume): Starter £99/mo (1 pipeline), Growth
    £169/mo (5, "Most Popular"), Scale £229/mo (unlimited + analytics).
  - **Agencies**: tiers gated by *client accounts held* (not pipelines —
    agencies bill clients a retainer regardless of hiring activity):
    Starter £249/mo (≤3 clients), Growth £419/mo (≤10), Scale £549/mo
    (unlimited). Unlimited users/search/pipelines in every tier — the
    per-client (not per-seat) model is flagged as a real differentiator
    vs. Bullhorn/Vincere/ATSpro.
  - **White label**: setup fee £1,000–£2,000 agreed; ongoing monthly fee
    **still open**, parked for a follow-up session.
- **Confirmed: no traditional job postings/apply flow, ever** — the
  employer's natural-language search *is* the discovery mechanism. This
  does **not** conflict with the "job module" below — see next section.

### Revised B2B workflow — what's different from what's already built here

The workflow handover (`docs/iCare_B2B_Recruitment_Workflow_Handover.md`)
and the wireframes describe employer-side mechanics that don't match
Sprints 6–11 as shipped in this repo. Concretely:

| Area | What this repo already built (Sprints 6–11) | What the new spec describes |
|---|---|---|
| Save/shortlist action | ~~One action — `shortlist_candidates` chat tool creates a `shortlists` row directly~~ — **shipped 2026-08-30, Sprint 14**: `bookmark_candidates` (own `bookmarks` table, private, no pipeline) vs. `send_invite` (job-gated, creates the pipeline entry, snapshots the job) |
| Pipeline stages | ~~`shortlists.stage` check-constrained to `shortlisted`/`interview`/`offer`/`hired`/`rejected`~~ — **migrated 2026-08-30, Sprint 14** (migration `0021`): **Shortlisted → Invited for Interview → Pending Interview Result → Successful/Rejected → Onboarding** — matches the wireframes and `lib/types.ts`'s `PipelineStage` exactly |
| Job record | ~~No `jobs`/vacancy entity exists~~ — **shipped 2026-08-30, Sprint 13**: `jobs` table (migration `0020_jobs`) + `src/jobs.ts`, never public/browsable, no apply button (doesn't reopen "no postings"). Mandatory 3-state sponsorship field DB-enforced (option 3 blocked for `care_assistant`/`senior_carer`). **Send Invite is not yet gated on it** — that hard gate is Sprint 14. |
| Profile access on accept | ~~`set_shortlist_consent()` — a boolean consent flag unlocking photo/video/CV, no documented expiry-on-close mechanic~~ — **shipped 2026-08-30, Sprint 15**: `shortlists.closed_at` + `set_shortlist_consent()`/`get_candidate_dossier()` both require `closed_at is null`; moving a pipeline to Rejected (or closing its job) sets it. New `profile_summaries` table freezes the AI profile view once, at acceptance (candidate's `POST /me/shortlists/:id/consent`), for that pipeline's lifetime — `who_is_summary` in `employer-chat.ts` reads it instead of regenerating live. |
| Search exclusion scope | Not explicitly documented as scoped | **Not yet built** — true (company × job) exclusion needs `search_candidates` itself to be job-scoped, which it isn't yet; deliberately deferred out of Sprint 14 rather than half-built (see `SPRINTS.md`). Exclusion should only trigger on Send Invite (never on Bookmark), and should **not be permanent** — a declined/rejected candidate should return to that company's pool for future jobs with a visible history flag. The one permanent block is candidate-initiated "do not contact me again." |
| Interview stage | Not built yet in this repo (pipeline stages stop at `offer`/`hired`) | Async self-scheduled video interview, system transcribes + summarises **for time only, never scored/ranked** — extends non-negotiable #5 explicitly to video. |
| Candidate consent response | Not documented as binary | Binary only: **Interested / Not interested** — no partial states. |
| Profile UI | No employer-facing candidate-detail screen built yet | A "dossier" concept exists in two mockup passes, current one at `docs/mockups/candidate-profile-dossier-v2.html` — three-column desktop-first layout, References/Employment history/Qualifications columns are **new profile sections with no data model here yet** (`employment_history` already exists in this repo's schema; a dedicated `references`-as-nominated-referees flow with its own third-party-consent question does not). Type system: Libre Caslon Text (name + descriptive-summary quote only) / Courier Prime (body) / Space Grotesk (chrome) — already noted as the planned employer-dossier system in §5 above; now there's a real mockup to build against. |

**Not a contradiction, just not built yet — new fields confirmed by both
sources**: candidates declaring their own sponsorship need (already
reflected in §12 above) now has a concrete home (onboarding step 1) and a
counterpart on the job record (previous paragraph); DBS mechanism detail
(Update Service subscription is the *only* legitimate "confirmed" path,
open question whether an online check alone is sufficient vs. the
employer must also view the physical certificate — needs legal input)
sharpens, doesn't change, non-negotiable #3.

### What this means practically — flag to the founder, don't resolve silently

1. **Candidate side is now built twice**, in two different stacks
   (Cloudflare Workers + vanilla HTML, live and deployed here; Next.js +
   Tailwind, mock-data reference, pushed to `docs/` on `main`). They're
   functionally aligned (same non-negotiables, same field set, same
   pipeline stage names even) but are not the same codebase and will
   drift if both are treated as live. **Needs a founder decision**: is
   the Next.js code purely a design/logic reference (as the original
   architecture note in §3 already decided for the *first* Next.js
   handover), or does the founder want a real migration to Next.js? Default
   assumption, unless told otherwise: **stays a reference — Cloudflare
   Workers remains the one deployed candidate-side app**, same as the
   standing 2026-08-25 decision.
2. ~~Employer-side pipeline stage names have to be decided~~ — **migrated
   2026-08-30, Sprint 14** (migration `0021`): six-stage model, matching
   the wireframes/workflow spec/Next.js types.
3. ~~Bookmark vs. Invite is a genuine gap~~ — **shipped 2026-08-30, Sprint
   14**: `bookmark_candidates` (private, own `bookmarks` table) split out
   from `send_invite` (job-gated) in `employer-chat.ts`.
4. ~~The `jobs` module is a real, unstarted piece of scope~~ — **shipped
   2026-08-30 as Sprint 13**: `jobs` table (migration `0020_jobs`) +
   `src/jobs.ts` (`/employers/jobs`). Creatable/listable/closeable, with
   the sponsorship-restriction check DB-enforced. **Now gates Send
   Invite** too, as of Sprint 14 — `send_invite` in `employer-chat.ts`
   requires a valid `job_id` from the employer's own active jobs.
5. ~~Scoped/revocable/frozen-at-acceptance profile access~~ — **shipped
   2026-08-30, Sprint 15**: `shortlists.closed_at` + `set_shortlist_
   consent()`/`get_candidate_dossier()` both gated on it; new
   `profile_summaries` table freezes the AI view at acceptance.

**Founder confirmed 2026-08-30: migrate now**, with this stage mapping
for in-flight data (`shortlists` had 0 rows at the time, so no real
backfill risk): `interview → invited_for_interview`, `offer → pending_
interview_result`, `hired → successful` (`shortlisted`/`rejected` keep
their names, `onboarding` is new). Build order, Sprints 13–17 in
`SPRINTS.md`: (a) `jobs` table — **shipped, Sprint 13** — (b) split
Bookmark out + migrate `shortlists.stage` to the six-stage enum +
hard-gate Send Invite on a `job_id` — **shipped, Sprint 14** (also fixed a
real bug found while building it: `shortlists`' old uniqueness on
`(employer_id, candidate_id)` made multiple pipelines per candidate
impossible, contradicting the workflow spec — see `SPRINTS.md` Sprint
14) — (c) rework profile-access grant to be pipeline-scoped + revocable +
frozen-at-acceptance — **shipped, Sprint 15** (fixed two more real bugs
found mid-build: `set_shortlist_consent()` was still employer-scoped, not
per-pipeline, so consenting to one invite would have silently touched
every pipeline with that employer; `shortlistConsented()` in
`employers.ts` used `.maybeSingle()`, which throws the moment a candidate
has two pipelines with one employer — both fixed, see `SPRINTS.md` Sprint
15) — (d) interview stage (Sprint 16, not started), (e) the dossier UI
(Sprint 17, not started). See `SPRINTS.md` for the full per-sprint scope.

**Wireframe testing links** (candidate + employer click-throughs, all 19
screens combined across both) were also published as private Claude
Artifacts this session for the founder to review visually — not part of
the repo, not live, links given directly to the founder in chat.

**2026-08-31 — founder flagged the gap directly:** Sprints 13–15 above
reconciled the employer-track *backend* against the wireframe/workflow
spec, but the jobseeker-facing pages (`sign-in.html`, `onboarding.html`,
`dashboard.html`) were never rebuilt against `docs/mockups/jobseeker-
wireframes.html` — they predate it. Founder confirmed via the live-site
walkthrough that what's deployed doesn't match the wireframe (no tab
bar, no dedicated Invites/Pipelines/Network/Credentials/Visibility
screens, no consent-moment screen). Asked to start on the frontend;
first slice:

- **Sprint 18 — jobseeker Invites screen — shipped 2026-08-31**: new
  `src/invites.html` (`/invites`) implements wireframe screens 03
  (Invites list, New/Accepted/Declined tabs) and 04 (Invite detail — the
  consent moment) against the *existing* `/me/shortlists*` routes; no new
  backend concept, "accept" = existing per-pipeline consent, "decline" =
  existing withdraw route. Added migration `0025` (`shortlists.decline_
  reason`, a fixed six-value list matching the wireframe's decline-reason
  picker) and extended `POST /me/shortlists/:id/withdraw` to accept an
  optional `reason` — a real, if small, product decision the wireframe
  calls out explicitly ("prefer not to say" must be a valid, complete
  answer; there's no way to decline with nothing shared), not something
  that could be faked purely in the frontend. Linked from `dashboard.html`
  (nav link + new-invites count badge); the dashboard's own inline
  shortlist/consent section was left in place rather than removed, to
  avoid breaking working functionality in the same pass — worth
  consolidating once the rest of the shell exists.
- **Sprint 19 — tab-bar shell + Pipelines screen — shipped 2026-08-31**:
  founder asked to build the shell first, then Pipelines. `src/nav-
  shell.html` is the new reference tab bar (Home/Invites/Pipelines/
  Network/Profile), copied into all five signed-in pages —
  `dashboard.html` is now understood as the wireframe's Profile tab
  rather than a standalone page. `src/pipelines.html` implements
  wireframe screen 05 (Active/Closed, six-stage tracker), scoped to
  ever-accepted rows only per the wireframe's own invite-vs-pipeline
  distinction. `src/home.html`/`src/network.html` are minimal, honest
  placeholders so all five tab destinations resolve — see the file map
  above and `SPRINTS.md`'s Sprint 19 note for the real feature work each
  still needs and the one deliberate wireframe deviation (a Successful/
  Onboarding pipeline stays in Active, not Closed — this backend's
  `closed_at` means access-revoked specifically, not "reached a terminal
  stage").
- **Sprint 20 — Credentials screen — shipped 2026-08-31**:
  `src/credentials.html` (wireframe screen 07), linked from
  `dashboard.html`. Badges + DBS + sponsorship-status (`right_to_work`)
  sections, all against existing routes. **Real gap surfaced while
  building this, not new**: the wireframe's three-state DBS model
  ("Not Yet Verified" / "Current — no new information" / "New
  information reported") was already flagged as unbuilt in the
  2026-08-30 PROGRESS.md entry (no `state` column on `dbs_records`, no
  staff confirmation workflow, and the underlying policy question — DBS
  guidance wants the physical certificate viewed too, no clean answer
  for a remote-first platform — explicitly needs legal input, not
  decided). This page does not fake that model: it shows only what's
  actually on file (level, Update Service registration, consent) rather
  than inventing a confirmation the platform has never performed.
  Building the real three-state flow needs that policy decision first.
- **Sprint 21 — Visibility screen — shipped 2026-08-31**:
  `src/visibility.html` (wireframe screen 08), linked from a new
  "Visibility" card on `dashboard.html`. The master "Findable by
  employers" switch is real and reversible — new `POST /candidates/
  me/unpublish` fills the gap that `is_published` previously had no way
  back to `false` except by closing the whole account. Verified against
  the live schema (RLS-scoped publish/unpublish round trip, confirmed a
  candidate can't write another candidate's row). The wireframe's
  field-by-field visibility matrix (About/Experience Public,
  Registrations/Availability Employers-only, etc.) is explicitly NOT
  built — no such preference exists anywhere in the schema, and the
  wireframe's own claim that "About you" is Public doesn't even match
  reality (`about`/`proud_of` are excluded from `candidate_search`
  entirely). The page shows a read-only, accurate breakdown instead of
  fake toggles.
- **Sprint 22 — real Home feed (peer visibility) — shipped 2026-08-31**:
  founder explicitly asked to build the real cross-candidate feed, not
  the you-only-content fallback that was offered as the safer default —
  see the exchange in this session's own log if exact wording matters.
  **Real gap found before building**: no path anywhere let one
  candidate read another's posts — `candidate_posts_self` RLS is
  self-only, `candidate_post_search` is employer-only
  (`is_verified_employer()`-gated). This was already flagged in an
  earlier session as deliberately unbuilt ("no surface exists for
  'visible to other candidates only,' and none was asked for" —
  PROGRESS.md, Sprint 8-era note). Building it meant a genuine new
  privacy surface, so this session stopped and asked before adding it
  rather than deciding alone; founder confirmed. New migration `0026`
  adds `candidate_peer_feed` (same security-definer-view pattern already
  used by `candidate_search`/`candidate_post_search`, gated by
  `current_role_is('candidate')` instead of `is_verified_employer()`),
  new `GET /candidates/feed` route, and `src/home.html` rebuilt from the
  Sprint 19 placeholder into the real page: pinned new-invites strip,
  composer, and the feed itself. Attribution is deliberately name-free —
  headline, primary profession, town — the exact same fields already
  shown to employers pre-consent via `candidate_search`, not a wider
  disclosure just because the audience changed. Verified directly
  against the live schema with two test candidates (one posts, the
  other reads the feed via the real RLS-scoped path) plus a negative
  test confirming a verified employer account gets zero rows from the
  new view.
- **Sprint 23 — real Network (LinkedIn-style connections) — shipped
  2026-08-31**: founder gave direct product instruction — send/accept/
  decline connection requests, LinkedIn-style; org "Follow" explicitly
  deprioritised. Migration `0027` adds `connections` (requester/
  addressee/status, order-independent unique pair index) and
  `candidate_discover` (same `current_role_is('candidate')`-gated
  pattern as `candidate_peer_feed`). Two real gaps found and fixed
  **during live-schema testing, before shipping** (both documented in
  their own migrations, not silently patched):
  - `0028` — `candidate_discover`'s reveal logic: `accounts_read_self`
    RLS means a candidate could never read another's `full_name`
    directly, even once connected, so the view folds the reveal
    condition into itself (`full_name` populated only when an accepted
    `connections` row exists between viewer and subject) rather than
    relying on a route to enforce it.
  - `0029` — the insert policy's own `exists(...)` check for "is the
    addressee published" ran under the *requester's* RLS, and
    candidates RLS only ever let a candidate read their own row or let
    a verified *employer* read published rows — so every request was
    silently blocked until a `candidate_is_published()` security-
    definer helper replaced the inline check.
  Discovery is profession/location search only, matching the fact names
  aren't searchable anywhere else in this product either. Verified with
  three test candidates end to end: request → duplicate-request
  correctly rejected (unique index) → accept restricted to the real
  addressee (a third party's accept attempt correctly blocked) → mutual
  name reveal confirmed both directions → an uninvolved fourth party
  still sees no name → remove/cleanup. `get_advisors` showed exactly the
  expected two new findings (the new view + new function, same accepted
  class as existing ones).
- **Sprint 24 — correct peer-visibility model: identity free-for-all
  within iCare — shipped 2026-08-31**: founder gave a direct, explicit
  course correction (see PROGRESS.md for the verbatim instruction):
  Sprints 22 and 23 had wrongly extended the employer-consent
  identity-hiding pattern to candidate-to-candidate visibility. The
  founder's actual model: inside iCare, everyone is assumed to be a
  fellow healthcare professional, never someone evaluating another for
  recruitment — so names and photos should be visible free-for-all,
  never gated behind a connection. **The identity-hidden-until-consent
  rule applies only on the employer/iRecruit side**, unchanged there.
  Posts instead get a visibility choice at compose time — public
  (anyone, even non-connections) vs. connections-only (hidden from
  anyone outside the poster's accepted-connections network) — with the
  Connect/Accept/Decline mechanic from Sprint 23 kept exactly as built,
  now gating post visibility rather than identity reveal.
  Migration `0030`: added `candidate_posts.visibility` (`public`/
  `connections`, default `public`, check constraint); rewrote
  `candidate_discover` to always return `full_name`/`has_photo`
  unconditionally (dropped the Sprint 23 conditional-reveal `case
  when exists(...)` logic entirely); rewrote `candidate_peer_feed` to
  always return `full_name`/`has_photo` and filter rows by
  `visibility = 'public' OR an accepted connection exists between
  viewer and poster` instead of `is_published` alone; updated
  `candidate_post_search` (the employer-facing view) to also require
  `visibility = 'public'`, so a connections-only post never surfaces in
  employer search either. One real Postgres error hit and fixed before
  applying: `CREATE OR REPLACE VIEW` can only append trailing columns,
  never reorder or insert mid-list (42P16) — the first draft put
  `visibility` before `created_at` in `candidate_peer_feed`'s column
  list, which changed an existing column's position; fixed by moving
  it to the end, preserving migration 0026's original column order
  exactly.
  New `GET /candidates/:id/photo` route (`src/candidates.ts`) — peer
  photo access with no consent gate, only `current_role_is('candidate')`
  + a new `candidate_is_published(p_candidate_id)` security-definer
  check (deliberately not the employer side's `shortlistConsented()`
  gate in `employers.ts`, which stays untouched). `POST /me/posts`
  validates the new optional `visibility` field against a fixed
  `['public','connections']` list.
  `src/home.html`/`src/network.html` rewritten to show real name +
  photo unconditionally (photo loaded via the new authenticated route,
  same blob/object-URL pattern already used in `employer-home.html`,
  since `<img src>` can't carry a bearer token); `src/home.html`/
  `src/dashboard.html` composers gained the public/connections-only
  toggle, and `dashboard.html`'s own post list now shows which
  visibility each post has.
  Verified directly against the live schema with two test candidates:
  `candidate_discover` reveals name/photo with zero connection
  required; a connections-only post is hidden from an unconnected
  viewer and becomes visible once an accepted connection exists;
  `candidate_post_search` (employer view) correctly excludes
  connections-only posts; a verified-employer account correctly fails
  `current_role_is('candidate')` and is blocked from the new peer
  photo route. All test rows deleted after, confirmed 0 leftover.
  `get_advisors` showed no new findings beyond the expected/pre-existing
  security-definer-view class. `tsc --noEmit` clean; `wrangler deploy
  --dry-run` clean (1330.28 KiB / 267.44 KiB gzip). Mock-shim
  click-through (Home feed + composer toggle, Network Connections +
  Discover tabs) confirmed correct rendering with zero JS errors: real
  names shown unconditionally everywhere, the connections-only tag
  renders correctly on a gated post, and the visibility toggle's active
  state switches correctly on click.
- **Still not built, in wireframe order**: the 7-day invite auto-expiry
  (needs an `expires_at` column set at invite creation in `employer-
  chat.ts`'s `send_invite` handler, plus a scheduled job — flagged, not
  started); org "Follow" (explicitly deprioritised this sprint, not
  decided against, just not now); real per-field visibility preferences
  (a genuine backend project — new preference storage plus rewriting
  `candidate_search` to select conditionally, not a frontend wire-up);
  the real DBS three-state confirmation flow (blocked on the legal/
  operational question in the Sprint 20 note); onboarding's step count/
  content still doesn't match the wireframe's 7-step outline (11 steps,
  different structure — not just renumbered). Sequencing these is an
  open question for the founder, not decided here.

---

## 15. Blog ("Insights") — built 2026-09-16 from an uploaded handover package

The founder uploaded a `icare-blog-handover.zip` (its own `HANDOVER.md`,
8 finished Markdown posts, a self-contained HTML design prototype,
`build_prototype.py`) written for **a Next.js App Router codebase**, with
the instruction to build it into `icareltd.com`.

**Real mismatch, checked before writing any code, not assumed:** this
repo — Cloudflare Workers + Hono, self-contained HTML, no framework, no
build step (see §2) — is the only repo that exists (confirmed via
`list_repos`, one result: `genesysc/icare`) and it **is** what serves
`icareltd.com` live. There is no deployed Next.js site anywhere for this
blog package to slot into. This is the same conclusion §3/§14 already
reached independently for the candidate-side Next.js reference code
(design/logic reference only, never migrated to) — consistent with a
standing decision, not a new one. So the blog was adapted to the real
stack rather than the assumed one, using the prototype as the exact
visual/structural source of truth (its CSS and HTML were ported close to
verbatim) while replacing every Next.js-specific mechanism with this
repo's own conventions:

| Handover spec | What actually shipped |
|---|---|
| MDX + `next-mdx-remote/rsc`, Zod build-time validation | Markdown stays the authoring format. `scripts/build-blog-content.js` (a devDependency-only Node script — `marked` + `js-yaml`, never bundled into the Worker) parses `content/posts/*.md` once, validates (unique slugs matching filename, valid category, `seoTitle`/`metaDescription` length, ≥3 sources, ≥1 FAQ, `relatedPosts` slugs resolve, warns — doesn't error — on stale `reviewBy` or a >1min reading-time drift) and writes a committed `src/blog-content.ts`. Re-run `npm run build:blog` and commit the regenerated file after any post is added or edited — same discipline as every other committed, pre-rendered content in this repo. |
| React Server Components, `generateStaticParams` | Hono routes in `src/blog.ts` render HTML server-side per request from the same static data — no client-side rendering, no hydration, nothing search engines can't see. |
| `ImageResponse` (Vercel/Satori) for OG images | No equivalent exists for Workers without a real added dependency. `/blog/:slug/opengraph-image` 302s to the Unsplash hero cropped to 1200×630 (`src/blog-images.ts`'s `ogImageUrl`) — a real, correctly-sized, working image, just not a branded text-overlay card. Flagged as a scoped-down piece, not silently dropped; a proper composited version is a real follow-up if wanted (e.g. `workers-og`, a Satori port for Workers — not evaluated in depth). |
| `next/image` + Imgix loader | Unsplash's CDN (`images.unsplash.com/photo-{id}`) accepts Imgix-style crop/quality params directly — hotlinked with plain `<img>`, explicit `width`/`height` (CLS), `loading="lazy"` (below the fold) / `fetchpriority="high"` (hero only, the Next `priority` equivalent). No API key needed for this part — confirmed live via `curl` before relying on it. |
| Unsplash API metadata + attribution + download-endpoint trigger | **Resolved 2026-09-16, founder provided a real key.** `UNSPLASH_ACCESS_KEY` is now set as a Worker secret (via the Cloudflare dashboard, not `wrangler.jsonc` — same pattern as `SENDER_API_KEY`). Wiring it up surfaced a real problem, found by testing the key against the live API rather than assuming it "just worked" once present: Unsplash has **two non-interchangeable photo identifiers** — the CDN path id (`images.unsplash.com/photo-{this}`, e.g. `1576765974257-b414b9ea0051`) used for hotlinking, and the API's own short `id` (e.g. `d3fe9qJDqaI`) that `GET /photos/{id}` requires. The 8 launch posts' `heroImage.unsplashId` values are the CDN kind (needed to build the offline prototype's hotlinks) — calling the API with one of those 404s "Couldn't find Asset", confirmed directly, not guessed. **Fix, scoped to future posts as the founder asked** (not a re-pick of the 8 launch images, which would risk misattributing a *different* photographer to a *wrong* photo if resolved by guesswork instead of the real id): a new optional frontmatter field, `heroImage.unsplashPhotoId` (the real API id — the last segment of a photo's `unsplash.com/photos/...` permalink). When a post sets it, `build-blog-content.js` calls the Unsplash API **once at build time** (`UNSPLASH_ACCESS_KEY=... npm run build:blog`), resolves the correct CDN id from the API's own `urls.raw` (never hand-constructed), the real photographer name + profile link, and fires the required download-location trigger exactly once — all baked into the committed `src/blog-content.ts`. This is a real improvement over a naive "call the API on every pageview" design: zero runtime API dependency for these posts (faster, resilient to the key being rotated/revoked later, doesn't over-trigger the download endpoint on every view). `src/blog.ts`'s article route uses `post.heroImage.credit` directly when present; the older per-request `resolveUnsplashCredit()` (`src/blog-images.ts`) stays as the fallback for posts that only have the legacy `unsplashId`. Verified against the real API before trusting it: resolved id `d3fe9qJDqaI` → CDN id `1576765974257-b414b9ea0051` → real credit `CDC` / `unsplash.com/@cdc` → hotlink URL built from that CDN id returned a real `200`, all checked directly via `curl`/a scratch build run (a temporary test post in `content/posts/`, removed and the file rebuilt clean afterward — never committed). |
| Waitlist-capture band | **Deliberately not a waitlist form.** The handover's own band assumed candidates were still pre-launch; they aren't — the 2026-09-14 landing rebuild already replaced `landing.html`'s waitlist form with real `/sign-up`/`/sign-in` CTAs once the candidate product went live (see PROGRESS.md). Building a stale email-capture form next to an already-working signup flow would have been a regression, not a feature — so the blog's band and article-end CTA use the same real `/sign-up` / `/sign-in` links `landing.html` does. Employers still have a genuine waitlist (`employers.html`, untouched, out of scope here). |
| `app/sitemap.ts` / `app/robots.ts` | Neither existed anywhere in this repo before — added at `GET /sitemap.xml` / `GET /robots.txt` in `src/index.ts`, covering `/`, `/employers`, `/privacy`, `/terms`, `/blog`, all 6 category hubs, and all 8 (growing) posts with `lastmod` from `dateModified`. |
| Author page, `Organization.sameAs`, analytics/consent tool, posting cadence | Open questions from the handover's own §14, genuinely unanswered here too — not decided unilaterally. See "Open questions" below. |

**Real bugs found by testing, not by reading the code:**
- The prototype's own CSS had `.mobile-share{display:none;...}` declared *after* the `@media(max-width:760px){.mobile-share{display:flex}}` block that was meant to override it — same specificity, later source position wins regardless of the media query, so the bottom mobile share bar never actually showed at any viewport width. Inherited faithfully during the port (CSS was copied close to verbatim), caught by a real Playwright check at a 390px viewport (`isVisible()` returned `false` when it should have been `true`), fixed by reordering the base rule before the media query.
- The handover's own frontmatter schema (§4) explicitly warned about this one and it still happened: post 5 (`health-care-worker-visa-settlement-2026.md`) carries both a `disclaimer` frontmatter field *and* an inline Markdown blockquote making the same point — my first build rendered both as separate notice callouts, a visible duplicate. Fixed in `build-blog-content.js`: when `disclaimer` is set, the source's own leading blockquote is stripped before Markdown conversion, so only the frontmatter version renders.
- Generic Unsplash credit read as "Photo: Unsplash on Unsplash" (the per-photographer template applied even when falling back to the generic name). Fixed with a distinct, honest "Photo via Unsplash" phrasing for the fallback case.

**File map additions:**

| File | What |
|---|---|
| `content/posts/*.md` | The 8 launch posts, git-tracked (frontmatter + Markdown body) — the actual source of truth for blog content. |
| `scripts/build-blog-content.js` | Content build step (`npm run build:blog`) — parses + validates + converts Markdown to `src/blog-content.ts`. devDependencies only (`marked`, `js-yaml`); never runs inside the deployed Worker. |
| `src/blog-content.ts` | **Generated, committed** — typed `BLOG_POSTS` array (frontmatter + pre-rendered `bodyHtml` + extracted `toc`). Re-run the build script and recommit after any content change. |
| `src/blog-images.ts` | Unsplash CDN URL helpers (hero/featured/list/related/OG crops) + `resolveUnsplashCredit()` (generic fallback today, real API once `UNSPLASH_ACCESS_KEY` exists). |
| `src/blog-templates.ts` | All page HTML (index/article/category hub), the full ported CSS, JSON-LD builders (`Organization`, `WebSite`, `BlogPosting`, `BreadcrumbList`, `FAQPage`, `Blog`+`ItemList`), share-button logic with per-platform UTM params. |
| `src/blog.ts` | Hono sub-app mounted at `/blog` — index, `/category/:slug`, `/feed.xml` (RSS 2.0), `/:slug/opengraph-image`, `/:slug` (article; registered last — Hono route order matters for the more specific paths above it). |
| `src/index.ts` | `app.route("/blog", blog)`, new `GET /sitemap.xml` / `GET /robots.txt`. |
| `src/landing.html`, `src/employers.html` | "Insights" added to header nav + footer on both public marketing pages (the handover's own acceptance checklist asked for this). Signed-in app pages (dashboard, rounds, etc.) intentionally left untouched — different navigation purpose, not part of top-level site nav. |

**Verified:** `tsc --noEmit` clean, `wrangler deploy --dry-run` clean
(1904 KiB / 559 KiB gzip — the ~140KB growth is `blog-content.ts`'s
embedded pre-rendered HTML for 8 posts, will grow roughly linearly with
future posts, worth revisiting only if it becomes a real bundle-size
problem). Real local server (`wrangler dev`, temporarily without the
`ai` binding — Workers AI needs a remote connection this sandbox has no
`CLOUDFLARE_API_TOKEN` for; nothing blog-related touches it) + Playwright
against all 8 articles and all 6 category hubs (200 everywhere, a real
404 for an unknown slug), RSS/sitemap validated as well-formed XML via
`xml.dom.minidom`, every JSON-LD block on an article page parsed
(`Organization`/`BreadcrumbList`/`BlogPosting`/`FAQPage`, 0 syntax
errors), TOC click-to-scroll + active-highlight, copy-link (clipboard +
toast), per-platform share UTM params, mobile viewport (390px, no
horizontal overflow, share rail hidden, mobile bar visible, index row
excerpts hidden), dark mode (`prefers-color-scheme` background actually
switches), zero page errors anywhere. Image URLs themselves verified via
direct `curl` (200) rather than in-browser rendering — this sandbox's
Chromium doesn't trust the outbound proxy's CA for arbitrary external
domains (`ERR_CERT_AUTHORITY_INVALID`), a sandbox-only artifact, not a
real bug; production Workers and real user browsers have no such proxy
in the path.

**Open questions carried over from the handover's own §14, genuinely
unresolved, not decided here:**
1. Named author vs. "iCare Editorial Team" (currently the latter, matches
   the handover's own default).
2. ~~`UNSPLASH_ACCESS_KEY`~~ — **resolved 2026-09-16**, set as a Worker
   secret; real attribution now resolves for any post using the new
   `heroImage.unsplashPhotoId` field, see the table above. The 8 launch
   posts still show the generic credit (no reliable way to get their real
   API ids from what the content package provided — not a key problem).
3. Social profils for `Organization.sameAs` — none added, none existed
   to add.
4. ~~Analytics/consent tool~~ — **resolved 2026-09-17**, Google Analytics
   4 wired site-wide behind a cookie-consent banner. See §16.
5. Posting cadence after the 8-post launch set — a content/marketing
   decision, not a code one.
6. Legal review of the immigration post (`health-care-worker-visa-
   settlement-2026.md`) — flagged by the handover itself, still needed,
   not something this session can do.

## 16. Analytics (Google Analytics 4 + cookie consent) — 2026-09-17

Founder chose GA4 over Plausible (cost) after an earlier same-session
Plausible implementation was built, verified working, then fully
reverted at the founder's request before ever being shipped — no trace
of it remains in the codebase or `main`.

**What's live:** the founder's real GA4 Measurement ID (`G-00D0TMNYLD`)
is wired site-wide — every static HTML page (`landing.html` through
`employer-home.html`, 18 pages) plus all three blog page types (index,
category hub, article, via `blog-templates.ts`'s shared `headTags()`).

**Why gated, not a bare `gtag.js` tag:** GA4 sets cookies, and under UK
GDPR/PECR that requires visitor consent *before* the cookie is set —
unlike the site's own signed-in session storage, which is essential and
needs none. Implemented as a bottom-of-page consent banner ("Accept" /
"Reject") that decides whether `gtag.js` is ever requested from Google
at all — "basic" consent mode, not "advanced" (which still sends
cookieless pings while denied). Verified via a real Playwright run
against a local `wrangler dev` instance (temporary config, same sandbox
workaround as elsewhere in this doc — no `CLOUDFLARE_API_TOKEN` for
remote bindings; deleted before shipping): fresh visit shows the banner
and fires zero requests to `googletagmanager.com`; clicking Accept loads
`gtag.js` and sets `localStorage.icare_analytics_consent = "granted"`;
clicking Reject sets `"denied"` and never requests it; a return visit
with either value already stored skips the banner entirely and either
loads GA immediately (granted) or stays silent (denied) — all 6 scenarios
passed, script at
`/tmp/.../scratchpad/pw-fetch/ga-consent-test.js` if it needs re-running.

**File map:** `src/ga-consent.js` is the canonical reference (like
`auth-client.js`) — **not imported by any route**. Every page copies its
runtime code verbatim into its own inline `<script>` near the top of
`<head>`; `blog-templates.ts` keeps its own copy as the `GA_CONSENT_SCRIPT`
string constant for the same reason (no shared-JS-file mechanism exists
in this repo — see §10). If the banner copy, styling, or consent logic
changes, all ~19 copies need updating together; there's no single source
of truth enforced at runtime, only at review time.

The existing `window.gtag`-calling event hooks in the blog article page
(`share_click`, `outbound_click`, `waitlist_submit`, `scroll_depth`,
`toc_click`) needed no changes — they already guard with
`if (window.gtag)`, so they silently no-op until a visitor accepts and
`window.gtag` actually exists.

`privacy.html`'s cookie section rewritten to name Google Analytics
specifically and describe the consent banner, replacing the older "we
don't currently use third-party analytics" line (accurate when written,
not anymore).

**Verified:** `tsc --noEmit` clean, `wrangler deploy --dry-run` clean.
