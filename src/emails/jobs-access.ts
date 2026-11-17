// Two small emails for the jobs-board access flow (migration 0062,
// src/jobs-access.ts): the internal request alert to info@ (with the
// approve/decline link) and the member's "you're in" email.

export type JobsAccessRequest = {
  candidate_id: string;
  full_name: string;
  email: string;
  profession: string | null;
  town: string | null;
  requested_at: string;
  approve_token: string;
};

export function jobsAccessRequestEmail(a: JobsAccessRequest, siteUrl: string): { subject: string; html: string } {
  const who = a.full_name.trim() || a.email;
  const when = new Date(a.requested_at).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const rows: Array<[string, string]> = [
    ["Name", a.full_name.trim() || "(not given)"],
    ["Email", a.email],
    ["Profession", a.profession || "—"],
    ["Town", a.town || "—"],
    ["Asked", `${when} (UK time)`],
  ];
  const link = `${siteUrl}/internal/jobs-access/${encodeURIComponent(a.approve_token)}`;

  const subject = `Jobs board access request: ${who}`;
  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;color:#1B1530;max-width:520px;">
  <p style="font-size:16px;margin:0 0 16px;"><strong>${escapeHtml(who)} has asked for access to the iCare jobs board.</strong></p>
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
  <p style="margin:22px 0 6px;">
    <a href="${link}" style="display:inline-block;background:#330072;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:999px;">Review this request</a>
  </p>
  <p style="font-size:12px;color:#5E5673;margin:14px 0 0;">
    The link opens a page with Approve and Decline buttons. Nothing changes until you press one.
    Please don't forward this email: anyone with the link can decide this request.
    Automatic alert from icareltd.com.
  </p>
</div>`;
  return { subject, html };
}

export function jobsAccessApprovedEmail(name: string, siteUrl: string): { subject: string; html: string } {
  const first = name.trim().split(/\s+/)[0] || "there";
  const subject = "You now have access to the iCare jobs board";
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f8f6f1;font-family:'Public Sans',system-ui,-apple-system,sans-serif;color:#5b5670;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <tr><td>
      <div style="font-family:Georgia,serif;font-weight:600;font-size:20px;color:#330072;margin-bottom:32px;">i<span style="color:#00A499;">Care</span></div>
      <h1 style="font-family:Georgia,serif;font-weight:600;font-size:26px;color:#330072;line-height:1.3;margin:0 0 16px;">You're in, ${escapeHtml(first)}.</h1>
      <p style="font-size:16px;line-height:1.6;margin:0 0 20px;">Your request has been approved. You can now browse UK health and care jobs from employers on the Home Office sponsor register, and apply.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 32px;"><tr><td>
        <a href="${siteUrl}/jobs" style="display:inline-block;padding:12px 24px;border-radius:999px;background:#330072;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">Open the jobs board</a>
      </td></tr></table>
      <p style="font-size:13px;color:#8a8599;line-height:1.6;margin:0;">&copy; 2026 iCare.</p>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, html };
}

function escapeHtml(text: string | null | undefined): string {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
