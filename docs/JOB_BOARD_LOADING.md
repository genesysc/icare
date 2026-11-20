# Loading jobs onto the iCare job board — runbook

How the first runs were done (Oct 2026, HANDOVER.md §27). Read this, then ask
Claude to do a run. Nothing here needs code changes: jobs go **straight into
the database**; the live site shows them as soon as they are loaded.

## The short version

1. **You** send Claude a list of links (a company's careers page, or single
   job adverts). Say which jobs you want (we have used: *health and care only*).
2. **Claude**, per employer: checks the site's rules → checks the employer is on
   the Home Office sponsor register → reads the adverts → loads the good ones.
3. Claude reports what was loaded, what was skipped and why.

## What Claude needs in the session

- The **Supabase MCP** connected to the `care-register` project (id
  `blflbiwqflidltqflwew`). Loading uses `upsert_sponsored_job()`, which is
  locked to the service role, so it **cannot** be called from the website, the
  anon key or GitHub Actions.
- Web access (public pages only). No logins, no credentials from you.
- The repo checked out (for notes and the scraper scripts in
  `scripts/job-scrapers/`).

## Rules we agreed (keep these)

- **Respect `robots.txt` and bot walls.** If a site disallows crawling, blocks us
  (403 / "blocked"), or sits behind a login, we do **not** work around it — we
  ask the employer for links/a feed instead. (We declined stealth browsers.)
- **Health and care roles only** (care assistants, team leaders, nurses,
  managers, wellbeing leads). Skip chefs, domestic, drivers, HR, admin.
- **Employer must be on the register** (A-rated). Matching is on the
  employer's **name** (any town — multi-site employers are fine, the job's own
  site is shown as `location_name`). If the name isn't on the register, the job
  stays hidden (`review`).
- **Sponsorship wording decides what we load:**
  - advert says sponsorship is offered/welcome → load;
  - advert says "no sponsorship" → **do not load**;
  - advert is silent → load only if the founder agreed that rule for that
    employer (we did for Renaissance, Hamill, Balmoral, Avenues, Right at Home);
    NHS Trusts (HCT) were loaded only when the advert said sponsorship is welcome.
- **Apply = link out** to the original advert (`apply_url`).
- **No dates on the advert?** Set a short `expires_at` (we used 30 days for
  evergreen "always recruiting" pages) so they drop off if not re-checked.
- Care-assistant / care-worker titles are automatically tagged "UK-based
  switchers only". The "Role meets visa rules" badge only appears with a SOC
  code and an annual salary ≥ £41,700 — we don't invent SOC codes.

## Loading a job (what Claude runs)

```sql
select * from upsert_sponsored_job($j${
  "source": "manual",
  "source_job_id": "<employer>:<stable id or url slug>",   -- unique; re-running updates, never duplicates
  "title": "...",
  "employer_name": "<exact name as on the register>",
  "town": "...", "region": "...",
  "location_name": "<the site, e.g. Benvie Care Home>",
  "salary_min": 13.45, "salary_max": 13.45, "salary_period": "hour",   -- or "year"
  "contract_type": "...", "hours": "...",
  "apply_url": "https://original-advert",
  "description": "...", "posted_at": "YYYY-MM-DD", "expires_at": "YYYY-MM-DDT23:59:59+00"
}$j$::jsonb);
```

The result shows `status` (`open` = visible, `review` = hidden because the
employer isn't on the register).

## Useful maintenance commands (SQL editor or Claude)

```sql
-- how many are live
select status, count(*) from sponsored_jobs group by 1;

-- hide a whole source without deleting (undo by setting status back to 'open'
-- and re-running upsert, or run sponsored_jobs_recheck)
update sponsored_jobs set status = 'closed' where source_job_id like 'rightathome:%';

-- what expires soon
select employer_name, title, expires_at from sponsored_jobs
 where status = 'open' and expires_at < now() + interval '7 days' order by expires_at;
```

## Daily sync (Stage 1, from 2026-11-17)

Renaissance Care, Balmoral and Right at Home (17 offices) are re-read every day by
`.github/workflows/job-sync.yml` → `scripts/job-sync/sync.py` (07:40 UTC, after the
register refresh). It adds new jobs, updates changed ones and closes ones that have
gone, using the agreed rules (health & care only, skip adverts that refuse sponsorship,
honour robots.txt). It reuses the existing `SPONSOR_REFRESH_SECRET`; no new secret.

- **Run it by hand:** GitHub → Actions → "Job board sync" → Run workflow. Untick
  "apply" for a dry run that only prints what it found (see the run's Summary tab).
- **Red run** = a source was blocked, changed layout or returned nothing. Its jobs are
  left untouched; tell Claude and it will fix that source.
- **Adding an employer to the sync:** needs a small reader in `sync.py` (a "list" step
  and a "parse one page" step) — ask Claude. Grantham (Right at Home) is deliberately
  excluded because its advert says no sponsorship.
- **Hiding a synced job for good:** closing it in the database is undone by the next
  run if the employer still lists it; remove it from the reader's rules instead.
- Jobs on these sources still get a 30-day rolling `expires_at` when the site shows no
  dates, refreshed each run — if the sync stops, they drop off within 30 days.

## Keeping it fresh

- Jobs with an `expires_at` disappear on that date by themselves. Others stay
  until closed — re-check an employer's page and close what's gone.
- **The sponsor register must be fresh.** A daily GitHub Action
  (`Sponsor register refresh`) downloads the Home Office file and re-checks every
  job. If it fails with `unauthorized`, the Actions secret
  `SPONSOR_REFRESH_SECRET` doesn't match the database copy: read
  `select value from app_secrets where key = 'sponsor_refresh_secret';` in the
  Supabase SQL editor, paste it into GitHub → Settings → Secrets and variables →
  Actions, and run the workflow manually.
- Employers who left the register drop to hidden at the next refresh.

## Where each source is documented

HANDOVER.md §27a–f: Renaissance Care, Hamill, HCT (via NHS Jobs), Balmoral,
Avenues, Randolph Hill, Right at Home, plus the list of sites we could not use
and why (myjobscotland, Totaljobs, CV-Library, Carr Gomm, Waythrough, Quarriers…).
