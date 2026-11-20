# Sponsor job sourcing (admin tool) — runbook and pilot

Admin-only page at `/admin/sourcing`. You paste company names that are already confirmed on
the Home Office sponsor register. iCare finds each company's website and careers page, reads
the vacancies, applies fixed rules, and publishes the jobs that pass to the existing job
board. Jobs that fail go to a "Rejected jobs" list with the reason. Public business contacts
(generic emails, named HR contacts) are saved for later outreach. **This tool never sends
email.**

## What the rules do (deterministic, no AI judgement)

| Rule | Result if it fails |
|---|---|
| If pay IS stated it must be at least the minimum (setting, default £12.83/hr; annual pay converted at the stated hours, else 37.5 h/week). **Pay not stated is allowed** (founder ruling 2026-11-20) and shows as "Salary not stated". | `below_minimum` |
| Advert has a working http(s) apply link. If the advert has none of its own, the employer's careers page is used (founder ruling 2026-11-20). | `no_apply_link` |
| Advert has a location (town/site) | `no_location` |
| Company is on the register (matched by name) | `no_register_match` |
| Same company + title + location is not already listed | `duplicate` |
| Advert does not say it refuses sponsorship | `sponsorship_refused` |
| Fewer than the daily publish cap (default 50) already published today | `daily_cap` (company marked "needs a look") |

Care Worker / Senior Care Worker / Care Assistant / Carer adverts are never shown as
"new applicant" sponsorship (that route closed 22 July 2025). If the advert mentions
sponsorship they show "switch only" with the note *Check sponsorship with the employer*.
**That wording needs legal sign-off before launch.**

The website found for a company must contain a distinctive word from the company's name (franchise names count: `surecare.co.uk` for "SureCare Leeds"); directories, regulators and sponsor lists are refused. A refused company shows "No website found" so you can check it by hand.

Role types are not filtered: any role at a healthcare employer can be shown (founder ruling 2026-11-20).

## One-off set-up (done 2026-11-20: migration applied, admin added, Firecrawl secret set)

1. Review, then apply `supabase/migrations/20261120100000_0065_sponsor_sourcing.sql`
   (it has been dry-run in a rolled-back transaction only).
2. Make yourself an admin (SQL editor, use the email you sign in to iCare with):
   `insert into app_admins (user_id) select id from auth.users where email = '<your login email>';`
3. Add the Firecrawl key as a Worker secret: `npx wrangler secret put FIRECRAWL_API_KEY`.
4. Deploy (merge to main).

## Pilot (about 20 companies)

1. Open `/admin/sourcing`, signed in as the admin.
2. Paste ~20 register-confirmed names, one per line, press **Find jobs**.
3. Check the Companies table (any "No website / No careers page / Needs a look"?), the board
   at `/jobs`, and the Rejected jobs reasons. Spot-check 10 published jobs against the original adverts.
4. Look at the cost: each company uses about 4 Firecrawl calls; a batch stops at its cap (default 100).
5. Decide: keep the rules, change the settings, or fix the finder.

Not verified here: the live Firecrawl calls (endpoint shapes are mock-tested only) — the
pilot is the first real test.

## Keeping it fresh

**Re-check live jobs** (button on the page, or `POST /admin/sourcing/api/upkeep`): re-reads each
careers page, marks listed jobs as seen, closes jobs not seen for 30 days. An empty or failed
read closes nothing.

## Contacts

Saved in `company_contacts` with the company's website (migration 0066). Free-provider personal addresses are skipped; addresses in
`contact_suppressions` are skipped; companies without Ltd/LLP/PLC/CIC are flagged
"sole trader" (their email may be personal data — check PECR before any outreach).
