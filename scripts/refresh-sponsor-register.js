#!/usr/bin/env node
// Daily refresh of the Home Office sponsor register into Supabase
// (`sponsors` / `register_runs`, migration 0052). Run by
// .github/workflows/sponsor-register-refresh.yml; also runnable locally:
//
//   SPONSOR_REFRESH_SECRET=... node scripts/refresh-sponsor-register.js
//
// 1. Ask GOV.UK's content API for the current CSV attachment — the file
//    name carries the date and changes every working day, so the URL is
//    never hard-coded.
// 2. Keep Route == "Skilled Worker" with a rating starting "Worker (A".
// 3. sponsor_refresh_begin → sponsor_refresh_load (batches) →
//    sponsor_refresh_check → sponsor_refresh_apply (until 0) →
//    sponsor_refresh_complete (migrations 0052/0053). Nothing is removed
//    from the live list until complete, so a run that dies part-way never
//    hides a sponsor; the next run starts over.
//
// Talks to Supabase with the publishable key + a shared secret checked
// inside the SECURITY DEFINER RPCs — no service_role key (same pattern as
// the news ingest cron). Exits non-zero on any failure so the Action run
// goes red and GitHub emails the repo owner.

const GOVUK_CONTENT_API =
  "https://www.gov.uk/api/content/government/publications/register-of-licensed-sponsors-workers";
// Public values, same as wrangler.jsonc's vars.
const SUPABASE_URL = process.env.SUPABASE_URL || "https://blflbiwqflidltqflwew.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_Ply3rrROmY-6gNxnppBwvg_eXI-z5pd";
const SECRET = process.env.SPONSOR_REFRESH_SECRET;
const BATCH_SIZE = 4000;
const APPLY_CHUNK = 4000;

// RFC 4180 CSV: quoted fields, doubled quotes, commas/newlines in quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function rpc(fn, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${fn} failed (${res.status}): ${body.slice(0, 500)}`);
  return body ? JSON.parse(body) : null;
}

async function main() {
  if (!SECRET) throw new Error("SPONSOR_REFRESH_SECRET is not set");

  const contentRes = await fetch(GOVUK_CONTENT_API);
  if (!contentRes.ok) throw new Error(`GOV.UK content API returned ${contentRes.status}`);
  const content = await contentRes.json();
  const attachment = (content.details?.attachments || []).find((a) => a.content_type === "text/csv");
  if (!attachment?.url) throw new Error("No text/csv attachment on the register publication");

  // Register date: from the file name ("... - 2026-10-14.csv"), else the
  // publication's own updated date.
  const fromName = attachment.url.match(/(\d{4}-\d{2}-\d{2})\.csv$/);
  const registerDate = fromName ? fromName[1] : String(content.public_updated_at).slice(0, 10);
  console.log(`Register ${registerDate}: ${attachment.url}`);

  const begin = await rpc("sponsor_refresh_begin", {
    p_secret: SECRET,
    p_register_date: registerDate,
    p_source_url: attachment.url,
  });
  if (begin.skip) {
    console.log(`Nothing to do: ${begin.reason}.`);
    await recheckJobs();
    return;
  }
  const runId = begin.run_id;

  const csvRes = await fetch(attachment.url);
  if (!csvRes.ok) throw new Error(`CSV download returned ${csvRes.status}`);
  const rows = parseCsv((await csvRes.text()).replace(/^﻿/, ""));
  const header = rows.shift().map((h) => h.trim());
  const col = (name) => {
    const i = header.indexOf(name);
    if (i === -1) throw new Error(`CSV is missing the "${name}" column (got: ${header.join(", ")})`);
    return i;
  };
  const iName = col("Organisation Name");
  const iTown = col("Town/City");
  const iCounty = col("County");
  const iRating = col("Type & Rating");
  const iRoute = col("Route");

  const kept = rows
    .filter((r) => (r[iRoute] || "").trim() === "Skilled Worker" && (r[iRating] || "").trim().startsWith("Worker (A"))
    .map((r) => ({ name: r[iName], town: r[iTown] || "", county: r[iCounty] || "", rating: r[iRating] }))
    .filter((r) => r.name && r.name.trim());
  console.log(`${rows.length} register rows, ${kept.length} A-rated Skilled Worker rows`);

  for (let i = 0; i < kept.length; i += BATCH_SIZE) {
    await rpc("sponsor_refresh_load", { p_secret: SECRET, p_run_id: runId, p_rows: kept.slice(i, i + BATCH_SIZE) });
  }

  const check = await rpc("sponsor_refresh_check", {
    p_secret: SECRET,
    p_run_id: runId,
    p_expected_rows: kept.length,
  });
  console.log("check:", JSON.stringify(check));
  if (!check.ok) throw new Error(`Refresh not applied: ${check.error}`);

  // Chunked so each call stays under anon's 3s statement timeout. A normal
  // day writes a few hundred rows (one call); the first-ever load ~30.
  let written = 0;
  for (let calls = 0; calls < 200; calls++) {
    const n = await rpc("sponsor_refresh_apply", { p_secret: SECRET, p_run_id: runId, p_limit: APPLY_CHUNK });
    written += n;
    if (n === 0) break;
  }
  console.log(`applied ${written} new or changed rows`);

  const result = await rpc("sponsor_refresh_complete", { p_secret: SECRET, p_run_id: runId });
  console.log("complete:", JSON.stringify(result));
  await recheckJobs();
}

// Re-badge every listed sponsored job against the now-current register
// (migration 0056): a job whose employer dropped off goes back to
// 'review' and disappears from the board; expired ones close. Runs even
// when the register was already current, so expiries still apply daily.
async function recheckJobs() {
  const r = await rpc("sponsored_jobs_recheck", { p_secret: SECRET });
  console.log("jobs recheck:", JSON.stringify(r));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
