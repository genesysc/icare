// Internal alert to info@icareltd.com when a live-in carer taps "I'm
// interested" on an iCare-posted live-in vacancy (src/live-in-alerts.ts,
// migration 0060). The carer's tap is their consent to share these details
// with iCare for this vacancy. Plain and scannable on a phone, same style as
// new-signup-alert.ts.

import { formatLiveInRate } from "./live-in-alert";

export type LiveInInterest = {
  vacancy_id: string;
  carer_id: string;
  vacancy_title: string;
  vacancy_area: string;
  full_name: string;
  preferred_name: string | null;
  email: string;
  phone: string;
  role: string;
  experience: string;
  live_in_experience: string;
  regions: string[] | null;
  postcode_area: string;
  blocks: string[] | null;
  start_date: string | null;
  rate_basis: string | null;
  rate_pence: number | null;
  rtw: string;
  dbs_state: string;
  interested_at: string;
};

const ROLE: Record<string, string> = {
  "care-assistant": "Care assistant",
  "senior-care-worker": "Senior care worker",
  "nurse-hca": "Nurse or healthcare assistant",
  other: "Other care role",
};
const EXPERIENCE: Record<string, string> = {
  "<1y": "Less than 1 year",
  "1-3y": "1 to 3 years",
  "3-5y": "3 to 5 years",
  "5-10y": "5 to 10 years",
  "10y+": "10+ years",
};
const LIVE_IN_EXPERIENCE: Record<string, string> = {
  "yes-regular": "Yes, regularly",
  "yes-few": "Yes, a few times",
  "no-keen": "No, but keen to start",
};
const RTW: Record<string, string> = {
  yes: "Yes, without restriction",
  "existing-visa": "Health and Care Worker visa, switching employer",
  "no-or-unsure": "No, or not sure",
};
// The three approved DBS strings only (HANDOVER §29 / handover §6).
const DBS: Record<string, string> = {
  not_yet_verified: "Not Yet Verified",
  current: "Current: no new information",
  new_info: "New information reported",
};
const REGION: Record<string, string> = {
  london: "London",
  "south-east": "South East",
  east: "East of England",
  midlands: "Midlands",
  "north-west": "North West",
  "north-east": "North East and Yorkshire",
  "south-west": "South West",
  wales: "Wales",
  scotland: "Scotland",
  "northern-ireland": "Northern Ireland",
};
const BLOCK: Record<string, string> = {
  "1w": "1 week",
  "2w": "2 weeks",
  "4w": "4 weeks",
  "8w+": "8 weeks or more",
  ongoing: "Ongoing",
  "short-cover": "Short cover",
};

export function liveInInterestEmail(a: LiveInInterest): { subject: string; html: string } {
  const name = a.full_name.trim() + (a.preferred_name && a.preferred_name.trim() ? ` (prefers "${a.preferred_name.trim()}")` : "");
  const when = new Date(a.interested_at).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const start = a.start_date
    ? new Date(`${a.start_date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : "—";
  const rows: Array<[string, string]> = [
    ["Vacancy", `${a.vacancy_title} — ${a.vacancy_area}`],
    ["Name", name],
    ["Phone", a.phone],
    ["Email", a.email],
    ["Role", ROLE[a.role] || a.role],
    ["Experience", EXPERIENCE[a.experience] || a.experience],
    ["Live-in before", LIVE_IN_EXPERIENCE[a.live_in_experience] || a.live_in_experience],
    ["Lives in", a.postcode_area],
    ["Will work in", (a.regions || []).map((r) => REGION[r] || r).join(", ")],
    ["Blocks", (a.blocks || []).map((b) => BLOCK[b] || b).join(", ")],
    ["Earliest start", start],
    ["Their rate", formatLiveInRate(a.rate_basis, a.rate_pence, null)],
    ["Right to work", RTW[a.rtw] || a.rtw],
    ["DBS", DBS[a.dbs_state] || "Not Yet Verified"],
    ["When", `${when} (UK time)`],
  ];

  const subject = `Live-in interest: ${a.full_name.trim()} for ${a.vacancy_title} (${a.vacancy_area})`;
  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;color:#1B1530;max-width:520px;">
  <p style="font-size:16px;margin:0 0 16px;"><strong>A live-in carer is interested in one of our vacancies.</strong></p>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;width:100%;">
    ${rows
      .map(
        ([k, v]) => `<tr>
      <td style="padding:8px 12px 8px 0;color:#5E5673;border-bottom:1px solid #E7E0F0;white-space:nowrap;vertical-align:top;">${k}</td>
      <td style="padding:8px 0;border-bottom:1px solid #E7E0F0;">${escapeHtml(v)}</td>
    </tr>`
      )
      .join("")}
  </table>
  <p style="font-size:12px;color:#5E5673;margin:20px 0 0;">
    They tapped "I'm interested", which is their consent to share these details with iCare for this vacancy.
    Don't pass their contact details to a client without telling them first.
    Automatic alert from icareltd.com. Vacancy id: ${escapeHtml(a.vacancy_id)}
  </p>
</div>`;
  return { subject, html };
}

function escapeHtml(text: string | null | undefined): string {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
