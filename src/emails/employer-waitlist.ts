// Welcome email sent when an organisation joins the iCare employer
// waitlist. Built now so it's ready to wire up, but NOT yet sent — see
// src/email.ts for why (same domain blocker as the candidate email).
//
// Kept deliberately free of any pricing commitment — employer pricing
// hasn't been decided yet, so this only confirms the signup and sets
// expectations for what happens next, not what it will cost.

export type EmployerWaitlistEmailData = {
  fullName: string;
  orgName: string;
  isEarlySupporter: boolean; // true when position <= EARLY_SUPPORTER_THRESHOLD
  landingUrl: string;
};

function shareLinks(landingUrl: string, text: string) {
  const encodedUrl = encodeURIComponent(landingUrl);
  const encodedText = encodeURIComponent(text);
  return {
    twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
  };
}

export function employerWaitlistEmail(data: EmployerWaitlistEmailData): { subject: string; html: string } {
  const firstName = data.fullName.trim().split(/\s+/)[0] || "there";
  const shareText = `${data.orgName} just joined the iCare employer waitlist — a new way to find verified health and social care staff. Worth a look:`;
  const links = shareLinks(data.landingUrl, shareText);

  const subject = "You're on the iCare employer waitlist";

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
        Thanks for joining, ${firstName}.
      </h1>

      <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">
        ${data.orgName} is officially on the iCare employer waitlist. We'll email you the moment
        organisations can start searching — every profile you'll see is built around real, evidenced
        experience, and every shortlist starts with the written case before anything visual.
      </p>

      ${data.isEarlySupporter
        ? `<p style="font-size:16px;line-height:1.6;margin:0 0 16px;">
             <strong style="color:#241533;">You're one of our first supporters.</strong>
             That means you'll be near the very front of the queue when employer access opens.
           </p>`
        : ""}

      <p style="font-size:16px;line-height:1.6;margin:0 0 28px;">
        In the meantime, know another team hiring health or social care staff? Sharing helps us build a
        better pool of candidates for everyone, faster.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
        <tr>
          <td style="padding-right:10px;">
            <a href="${links.twitter}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#241533;color:#fefefc;text-decoration:none;font-size:13px;font-weight:600;">Share on X</a>
          </td>
          <td style="padding-right:10px;">
            <a href="${links.linkedin}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#241533;color:#fefefc;text-decoration:none;font-size:13px;font-weight:600;">Share on LinkedIn</a>
          </td>
          <td style="padding-right:10px;">
            <a href="${links.facebook}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#241533;color:#fefefc;text-decoration:none;font-size:13px;font-weight:600;">Facebook</a>
          </td>
          <td>
            <a href="${links.whatsapp}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#241533;color:#fefefc;text-decoration:none;font-size:13px;font-weight:600;">WhatsApp</a>
          </td>
        </tr>
      </table>

      <p style="font-size:13px;color:#8a8599;line-height:1.6;margin:0;">
        &copy; 2026 iCare. You're receiving this because ${data.orgName} joined the iCare employer waitlist at ${data.landingUrl}.
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
