# iCare — Progress Log

This file is the source of truth for "where we left off." Any AI assistant
picking up this project — on any device, any tool — should read this file
first, and update it before ending a session. See `AGENTS.md` / `CLAUDE.md`
for the standing instruction.

## Status: blocked on a manual Cloudflare Dashboard step

## Stack / accounts
- **GitHub**: `genesysc/icare`
- **Cloudflare account**: "iCare" (`181e44a6963cb30381a30edbd56a4b46`) — dedicated
  account for this project, separate from other unrelated Cloudflare projects
  on the same login. Account-scoped tools require passing this `account_id`
  explicitly.
- **D1 database**: `icare-db` (uuid `dfd93b50-c45d-4fb0-b93d-930f3248830f`),
  bound as `DB` in `wrangler.jsonc`.
- **R2 bucket**: `icare`, bound as `MEDIA` in `wrangler.jsonc`.
- **Worker**: `icare` (Hono app in `src/index.ts`), routes: `/health`,
  `/db-check`, `/media-check`.
- **CI**: `.github/workflows/deploy.yml` deploys to Cloudflare Workers on
  push to `main`. Requires repo secrets `CLOUDFLARE_API_TOKEN` (scoped to
  the iCare account: Workers Scripts / R2 / D1 — Edit) and
  `CLOUDFLARE_ACCOUNT_ID` — both already added.

## Done
- Connected Cloudflare account "iCare" (separate from other projects).
- Created D1 database `icare-db`.
- Enabled R2 and created bucket `icare`.
- Scaffolded a minimal Workers app (Hono) with D1 + R2 bindings.
- Fixed CI: pinned `wranglerVersion: "4"` and Node 22 in `deploy.yml`
  (wrangler-action was defaulting to an incompatible Wrangler 3.x).

## Current blocker
Deploy fails with: `You need to register a workers.dev subdomain before
publishing to workers.dev`. This is a one-time, account-level manual step
Cloudflare requires — no API/MCP tool available to do it programmatically.

**Next step (needs a human in the Cloudflare Dashboard):**
Dashboard → iCare account → Workers & Pages → set up the `workers.dev`
subdomain → re-run the `Deploy to Cloudflare Workers` GitHub Actions
workflow (push to `main`, or re-run the failed run).

## Not started yet
- Actual app features (this is a LinkedIn-style platform for healthcare,
  per the README) — no data model, auth, or UI exists yet.
- D1 schema / migrations.
- Custom domain (account currently has none).
