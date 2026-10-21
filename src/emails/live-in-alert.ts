// Live-in availability alert. Content is deliberately narrow (handover §5.2
// and §7): area, block length, rate and start date only. No client name, no
// care-plan detail, no address — the platform does not hold those here and
// the email must not imply otherwise.
//
// Every send includes a management/unsubscribe link. Unsubscribing requires
// sign-in, which is why the link goes to the profile page rather than a
// one-click token: the profile page is the single place the three consents
// are changed, and it is auditable.

export type LiveInAlertRole = {
  jobTitle: string | null;
  jobLocation: string | null;
  payRange: string | null;
  // Unused in the email: `jobs` has no start date, and the carer's own
  // earliest start must not be shown as if it were the role's.
  startDate?: string | null;
  blocks: string;
};

export type LiveInAlertEmailData = {
  displayName: string;
  roles: LiveInAlertRole[];
  siteUrl: string;
};

export function liveInAlertEmail(data: LiveInAlertEmailData): { subject: string; html: string } {
  const firstName = (data.displayName || "").trim().split(/\s+/)[0] || "there";
  const first = data.roles[0];
  const many = data.roles.length > 1;
  const subject = many
    ? `${data.roles.length} live-in roles match your profile`
    : `Live-in work in ${first.jobLocation || "your area"} — ${first.blocks || "block length on request"}`;

  const cards = data.roles
    .map(
      (role) => `
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;border:1px solid #d9d2e6;border-radius:12px;">
        <tr><td style="padding:16px 18px;font-size:15px;line-height:1.7;">
          ${role.jobTitle ? `<strong style="color:#330072;">${escapeHtml(role.jobTitle)}</strong><br />` : ""}
          <strong>Area:</strong> ${escapeHtml(role.jobLocation || "Not specified")}<br />
          <strong>Block:</strong> ${escapeHtml(role.blocks || "Not specified")}<br />
          <strong>Rate:</strong> ${escapeHtml(role.payRange || "Not specified")}
        </td></tr>
      </table>`
    )
    .join("");

  const heading = many
    ? `${data.roles.length} live-in roles match your profile, ${escapeHtml(firstName)}.`
    : `Live-in work in ${escapeHtml(first.jobLocation || "your area")}, ${escapeHtml(firstName)}.`;

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
        ${heading}
      </h1>

      <p style="font-size:16px;line-height:1.6;margin:0 0 20px;">
        ${many ? "Roles matching" : "A role matching"} the areas and block lengths on your live-in profile ${many ? "have" : "has"} been added.
      </p>
${cards}
      <p style="font-size:16px;line-height:1.6;margin:8px 0 28px;">
        If the employer invites you, the invite appears on your live-in profile and you decide whether to accept. Your name and contact details are not shared unless you do.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
        <tr><td>
          <a href="${data.siteUrl}/live-in-profile" style="display:inline-block;padding:12px 24px;border-radius:999px;background:#330072;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">Open my live-in profile</a>
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

function escapeHtml(text: string | null | undefined): string {
  return String(text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
