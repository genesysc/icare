// Live-in availability alert. Content is deliberately narrow (handover §5.2
// and §7): area, block length, rate and start date only. No client name, no
// care-plan detail, no address — the platform does not hold those here and
// the email must not imply otherwise.
//
// Every send includes a management/unsubscribe link. Unsubscribing requires
// sign-in, which is why the link goes to the profile page rather than a
// one-click token: the profile page is the single place the three consents
// are changed, and it is auditable.

export type LiveInAlertEmailData = {
  displayName: string;
  jobTitle: string;
  jobLocation: string;
  payRange: string;
  startDate: string;
  blocks: string;
  siteUrl: string;
};

export function liveInAlertEmail(data: LiveInAlertEmailData): { subject: string; html: string } {
  const firstName = data.displayName.trim().split(/\s+/)[0] || "there";
  const subject = `Live-in work in ${data.jobLocation} — ${data.blocks || "block length on request"}`;
  const start = data.startDate ? new Date(`${data.startDate}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "To be agreed";

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f8f6f1;font-family:'Public Sans',system-ui,-apple-system,sans-serif;color:#5b5670;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <tr><td>
      <div style="font-family:Georgia,serif;font-weight:600;font-size:20px;color:#330072;margin-bottom:32px;">
        i<span style="color:#00A499;">Care</span>
      </div>

      <h1 style="font-family:Georgia,serif;font-weight:600;font-size:26px;color:#330072;line-height:1.3;margin:0 0 16px;">
        Live-in work in ${escapeHtml(data.jobLocation)}, ${escapeHtml(firstName)}.
      </h1>

      <p style="font-size:16px;line-height:1.6;margin:0 0 20px;">
        A role matching the areas and block lengths on your live-in profile has been added.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px;border:1px solid #d9d2e6;border-radius:12px;">
        <tr><td style="padding:16px 18px;font-size:15px;line-height:1.7;">
          <strong>Area:</strong> ${escapeHtml(data.jobLocation)}<br />
          <strong>Block:</strong> ${escapeHtml(data.blocks || "Not specified")}<br />
          <strong>Rate:</strong> ${escapeHtml(data.payRange)}<br />
          <strong>Start:</strong> ${escapeHtml(start)}
        </td></tr>
      </table>

      <p style="font-size:16px;line-height:1.6;margin:0 0 28px;">
        Open your profile to see the invite and decide. Your name and contact details are not shared unless you accept.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
        <tr><td>
          <a href="${data.siteUrl}/live-in-profile" style="display:inline-block;padding:12px 24px;border-radius:999px;background:#330072;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">View the role</a>
        </td></tr>
      </table>

      <p style="font-size:13px;color:#8a8599;line-height:1.6;margin:0;">
        &copy; 2026 iCare. You're receiving this because you opted into live-in alerts.
        <a href="${data.siteUrl}/live-in-profile" style="color:#8a8599;">Change frequency or switch alerts off</a>.
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
