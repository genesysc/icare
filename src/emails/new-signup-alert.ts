// Internal alert to info@icareltd.com when someone creates an iCare
// account (src/signup-alerts.ts, migration 0058). Not a member-facing
// email — plain and scannable on a phone.

export type NewSignupAlert = {
  account_id: string;
  role: string;
  full_name: string;
  email: string;
  created_at: string;
  email_confirmed: boolean;
  provider: string;
};

const PROVIDER_LABEL: Record<string, string> = {
  email: "Email (password or code)",
  google: "Google",
  linkedin_oidc: "LinkedIn",
};

export function newSignupAlertEmail(a: NewSignupAlert): { subject: string; html: string } {
  const who = a.full_name.trim() || a.email;
  const roleLabel = a.role === "employer" ? "Employer" : a.role === "candidate" ? "Candidate" : a.role;
  const when = new Date(a.created_at).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const rows: Array<[string, string]> = [
    ["Name", a.full_name.trim() || "(not given)"],
    ["Email", a.email],
    ["Account type", roleLabel],
    ["Signed up with", PROVIDER_LABEL[a.provider] || a.provider],
    ["Email confirmed", a.email_confirmed ? "Yes" : "Not yet"],
    ["When", `${when} (UK time)`],
  ];

  const subject = `New iCare sign-up: ${who} (${roleLabel})`;
  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;color:#1B1530;max-width:520px;">
  <p style="font-size:16px;margin:0 0 16px;"><strong>Someone just created an iCare account.</strong></p>
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
    "Email confirmed: Not yet" is normal for password sign-ups — they confirm by code just after.
    Automatic alert from icareltd.com. Account id: ${escapeHtml(a.account_id)}
  </p>
</div>`;
  return { subject, html };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
