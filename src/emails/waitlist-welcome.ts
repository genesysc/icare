// Welcome email sent when someone joins the iCare waitlist. Built now so
// it's ready to wire up, but NOT yet sent — see src/email.ts for why.
//
// Compliance note: no "credits" or paid-feature language here. Per
// HANDOVER.md's non-negotiable #1 (candidates are never charged, for
// anything — Employment Agencies Act 1973 s6(1)), early signups get
// priority/recognition only, never a bonus toward a paid feature.

export type WaitlistWelcomeEmailData = {
  fullName: string;
  isEarlySupporter: boolean; // true when position <= EARLY_SUPPORTER_THRESHOLD
  landingUrl: string;
};

export const EARLY_SUPPORTER_THRESHOLD = 100;

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

export function waitlistWelcomeEmail(data: WaitlistWelcomeEmailData): { subject: string; html: string } {
  const firstName = data.fullName.trim().split(/\s+/)[0] || "there";
  const shareText = "I just joined the iCare waitlist — a new platform for carers, nurses and healthcare professionals. Worth a look:";
  const links = shareLinks(data.landingUrl, shareText);

  const subject = "You're on the iCare waitlist";

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
        You're officially on the iCare waitlist. We'll email you the moment the site is live so you can
        build your profile and get found by employers who need people like you.
      </p>

      ${data.isEarlySupporter
        ? `<p style="font-size:16px;line-height:1.6;margin:0 0 16px;">
             <strong style="color:#241533;">You're one of our first ${EARLY_SUPPORTER_THRESHOLD} supporters.</strong>
             That means you'll be near the very front of the queue when we open the doors.
           </p>`
        : ""}

      <p style="font-size:16px;line-height:1.6;margin:0 0 28px;">
        In the meantime, know someone who'd want to hear about this too? Sharing helps us build a
        better platform for everyone, faster.
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
        &copy; 2026 iCare. You're receiving this because you joined the iCare waitlist at ${data.landingUrl}.
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
