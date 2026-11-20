// One-off "finish your profile" email (migration 0063, src/onboarding-nudge.ts).
// A reminder about the member's own account, sent once, from hello@ through
// Sender's transactional channel. No promotion, no payment wording.

export function onboardingNudgeEmail(fullName: string, siteUrl: string): { subject: string; html: string } {
  const first = (fullName || "").trim().split(/\s+/)[0] || "there";
  const subject = "Finish your iCare profile";
  const link = `${siteUrl}/sign-in?next=/onboarding`;
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f8f6f1;font-family:'Public Sans',system-ui,-apple-system,sans-serif;color:#5b5670;">
  <div style="display:none;max-height:0;overflow:hidden;">It only takes a few minutes, and it opens up the rest of iCare.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <tr><td>
      <div style="font-family:Georgia,serif;font-weight:600;font-size:20px;color:#330072;margin-bottom:32px;">i<span style="color:#00A499;">Care</span></div>
      <h1 style="font-family:Georgia,serif;font-weight:600;font-size:26px;color:#330072;line-height:1.3;margin:0 0 16px;">Hi ${escapeHtml(first)}, your profile isn't finished yet.</h1>
      <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">Thanks for creating your iCare account. Until your profile is finished, other members can't find you and some parts of iCare stay locked.</p>
      <p style="font-size:16px;line-height:1.6;margin:0 0 8px;">Once it's done, you can:</p>
      <ul style="font-size:16px;line-height:1.6;margin:0 0 24px;padding-left:20px;">
        <li>find and connect with other health and care professionals in the network</li>
        <li>request access to the jobs board, with roles from Home Office licensed sponsors</li>
        <li>keep your registrations, training and checks in one place to share with employers</li>
      </ul>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;"><tr><td>
        <a href="${link}" style="display:inline-block;padding:13px 26px;border-radius:999px;background:#330072;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Finish my profile</a>
      </td></tr></table>
      <p style="font-size:15px;line-height:1.6;margin:0 0 28px;">If something is stopping you from finishing, just reply to this email or write to <a href="mailto:info@icareltd.com" style="color:#330072;">info@icareltd.com</a> and we'll help.</p>
      <p style="font-size:16px;line-height:1.6;margin:0 0 28px;">The iCare team</p>
      <p style="font-size:12px;color:#8a8599;line-height:1.6;margin:0;">&copy; 2026 iCare. You're getting this one-off message because you created an iCare account and haven't finished your profile. We won't send it again. If you'd rather not hear from us, reply and tell us.</p>
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, html };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
