// Sent when an employer submits (or re-submits) for verification via
// POST /employers/me/verification-requests. Built now so it's ready to wire
// up once Sender.net sending is actually configured — see src/email.ts.
//
// No SLA/turnaround promise — review is entirely manual right now (see
// src/employers.ts), so a specific timeframe would be a claim we can't back.

export type EmployerVerificationSubmittedEmailData = {
  fullName: string;
  orgName: string;
  companiesHouseNo: string;
  regulatorLabel: string | null; // e.g. "CQC (England)", or null if not given
  homeUrl: string;
};

export function employerVerificationSubmittedEmail(data: EmployerVerificationSubmittedEmailData): { subject: string; html: string } {
  const firstName = data.fullName.trim().split(/\s+/)[0] || "there";
  const subject = "We've received your verification details";

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#fbf9f6;font-family:'Inter',system-ui,-apple-system,sans-serif;color:#5b5566;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <tr><td>
      <div style="font-family:Georgia,serif;font-weight:600;font-size:20px;color:#2e0b4d;margin-bottom:32px;">
        i<span style="color:#00a499;">Care</span>
      </div>

      <h1 style="font-family:Georgia,serif;font-weight:600;font-size:26px;color:#2e0b4d;line-height:1.3;margin:0 0 16px;">
        Thanks, ${firstName}.
      </h1>

      <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">
        We've received your verification details for <strong style="color:#1b1420;">${data.orgName}</strong>.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e7e3da;border-radius:12px;margin:0 0 24px;">
        <tr><td style="padding:16px 20px;">
          <p style="font-size:13px;color:#8a8599;margin:0 0 4px;">Companies House number</p>
          <p style="font-size:15px;color:#1b1420;font-weight:600;margin:0 0 ${data.regulatorLabel ? "14px" : "0"};">${data.companiesHouseNo}</p>
          ${data.regulatorLabel
            ? `<p style="font-size:13px;color:#8a8599;margin:0 0 4px;">Care regulator</p>
               <p style="font-size:15px;color:#1b1420;font-weight:600;margin:0;">${data.regulatorLabel}</p>`
            : ""}
        </td></tr>
      </table>

      <p style="font-size:16px;line-height:1.6;margin:0 0 28px;">
        We review these by hand, so it won't be instant — but we'll email you the moment your
        organisation is confirmed. If anything doesn't check out, we'll let you know what to fix.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
        <tr><td>
          <a href="${data.homeUrl}" style="display:inline-block;padding:12px 24px;border-radius:999px;background:#330072;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">View your account</a>
        </td></tr>
      </table>

      <p style="font-size:13px;color:#8a8599;line-height:1.6;margin:0;">
        &copy; 2026 iCare. You're receiving this because you submitted employer verification details on iCare.
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
