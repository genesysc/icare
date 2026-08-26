// Sent when an employer's verification is approved (employers.is_verified
// flips to true). Built now, ready to wire up once Sender.net sending is
// configured — see src/email.ts.
//
// NOT currently wired to any code path — see the note in employers.ts.
// is_verified can only be flipped by service_role (a DB trigger enforces
// this), and review is a manual Supabase dashboard edit with no API call
// behind it, so there's no route handler for this to fire from yet. Sending
// it automatically needs either a Postgres database webhook on employers
// (is_verified transitioning to true) calling a new Worker route, or a real
// admin review route once that's built — a decision for the founder, not
// assumed here.

export type EmployerVerifiedEmailData = {
  fullName: string;
  orgName: string;
  homeUrl: string;
};

export function employerVerifiedEmail(data: EmployerVerifiedEmailData): { subject: string; html: string } {
  const firstName = data.fullName.trim().split(/\s+/)[0] || "there";
  const subject = "You're verified on iCare";

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
        You're verified, ${firstName}.
      </h1>

      <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">
        <strong style="color:#1b1420;">${data.orgName}</strong> is now a verified employer on iCare.
        You'll see this reflected in your account, and it's a one-time check — no need to resubmit
        unless your details change.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
        <tr><td>
          <a href="${data.homeUrl}" style="display:inline-block;padding:12px 24px;border-radius:999px;background:#330072;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">View your account</a>
        </td></tr>
      </table>

      <p style="font-size:13px;color:#8a8599;line-height:1.6;margin:0;">
        &copy; 2026 iCare. You're receiving this because your employer account was verified on iCare.
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
