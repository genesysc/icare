// Sent when a candidate's profile is published via POST /candidates/me/publish
// (publish_my_profile() returning true). Built now so it's ready to wire up
// once Sender.net sending is actually configured — see src/email.ts.
//
// Deliberately doesn't claim employers are already searching/finding them —
// the employer track (search, Sprint 8) isn't built yet. Overclaiming
// discovery that doesn't exist would be dishonest, same spirit as the DBS
// wording non-negotiable elsewhere in this build.

export type CandidateProfilePublishedEmailData = {
  fullName: string;
  dashboardUrl: string;
};

export function candidateProfilePublishedEmail(data: CandidateProfilePublishedEmailData): { subject: string; html: string } {
  const firstName = data.fullName.trim().split(/\s+/)[0] || "there";
  const subject = "Your iCare profile is live";

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f8f6f1;font-family:'Inter',system-ui,-apple-system,sans-serif;color:#5b5670;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <tr><td>
      <div style="font-family:Georgia,serif;font-weight:600;font-size:20px;color:#241533;margin-bottom:32px;">
        i<span style="color:#16b8a6;">Care</span>
      </div>

      <h1 style="font-family:Georgia,serif;font-weight:600;font-size:26px;color:#241533;line-height:1.3;margin:0 0 16px;">
        You're published, ${firstName}.
      </h1>

      <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">
        Your iCare profile is live — your professional history, skills, and evidence are all in one
        place, ready for the moment an employer needs someone like you.
      </p>

      <p style="font-size:16px;line-height:1.6;margin:0 0 28px;">
        You can come back and update anything — a new qualification, a change in availability, a
        fresh reference — any time, and it stays live the moment you save it.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
        <tr><td>
          <a href="${data.dashboardUrl}" style="display:inline-block;padding:12px 24px;border-radius:999px;background:#16b8a6;color:#fefefc;text-decoration:none;font-size:14px;font-weight:700;">View your profile</a>
        </td></tr>
      </table>

      <p style="font-size:13px;color:#8a8599;line-height:1.6;margin:0;">
        &copy; 2026 iCare. You're receiving this because you published a candidate profile on iCare.
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
