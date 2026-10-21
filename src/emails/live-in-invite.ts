// Sent when a verified employer invites a live-in carer to a specific job.
// Mirrors candidate-invite-received.ts's shape; kept separate because the
// live-in register has its own consent gate and its own page.
//
// The email must not imply contact details were shared: nothing is shared
// until the carer accepts, and the copy says so.

export type LiveInInviteEmailData = {
  displayName: string;
  jobTitle: string;
  jobLocation: string;
  orgName: string;
  message?: string | null;
  siteUrl: string;
};

export function liveInInviteEmail(data: LiveInInviteEmailData): { subject: string; html: string } {
  const firstName = data.displayName.trim().split(/\s+/)[0] || "there";
  const subject = `${data.orgName} invited you to a live-in role in ${data.jobLocation}`;
  const note = data.message
    ? `<p style="font-size:16px;line-height:1.6;margin:0 0 20px;padding:14px 16px;background:#f4f1f8;border-radius:10px;">${escapeHtml(data.message)}</p>`
    : "";

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
        A live-in role in ${escapeHtml(data.jobLocation)}, ${escapeHtml(firstName)}.
      </h1>

      <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">
        <strong>${escapeHtml(data.orgName)}</strong> would like you to apply for
        <strong>${escapeHtml(data.jobTitle)}</strong> on iCare.
      </p>

      ${note}

      <p style="font-size:16px;line-height:1.6;margin:0 0 28px;">
        Your name and contact details stay private until you accept. Review the role
        and decide in your own time.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
        <tr><td>
          <a href="${data.siteUrl}/live-in-profile" style="display:inline-block;padding:12px 24px;border-radius:999px;background:#330072;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">View the invite</a>
        </td></tr>
      </table>

      <p style="font-size:13px;color:#8a8599;line-height:1.6;margin:0;">
        &copy; 2026 iCare. You're receiving this because you joined the live-in carer register.
        Change or stop these emails in <a href="${data.siteUrl}/live-in-profile" style="color:#8a8599;">your live-in profile</a>.
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
