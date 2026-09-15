// Sent when an employer sends a shortlist/interview invite via
// employer-chat.ts's send_invite tool, one per newly-inserted shortlist
// row (re-invites for a job the candidate already has are skipped by the
// upsert's ignoreDuplicates, so this never double-sends for the same
// invite — see migration 0043's notify_new_invite trigger comment, which
// relies on the same fact for the in-app notification).
//
// This is the one event type this pass sends email for (see HANDOVER.md's
// 2026-09-15 notifications entry) — the highest-stakes of the four
// candidate-facing events this build tracks, and candidates return every
// few months per this product's own design notes (§6), so an in-app-only
// signal risks being missed entirely between visits. Connection requests,
// acceptances and messages stay in-app only for now.

export type CandidateInviteReceivedEmailData = {
  fullName: string;
  orgName: string;
  jobTitle: string;
  invitesUrl: string;
};

export function candidateInviteReceivedEmail(data: CandidateInviteReceivedEmailData): { subject: string; html: string } {
  const firstName = data.fullName.trim().split(/\s+/)[0] || "there";
  const subject = `${data.orgName} invited you to apply for ${data.jobTitle}`;

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
        You've been invited, ${firstName}.
      </h1>

      <p style="font-size:16px;line-height:1.6;margin:0 0 16px;">
        <strong>${escapeHtml(data.orgName)}</strong> would like you to apply for
        <strong>${escapeHtml(data.jobTitle)}</strong> on iCare.
      </p>

      <p style="font-size:16px;line-height:1.6;margin:0 0 28px;">
        Nothing is shared with them beyond what's already visible until you decide —
        review the role and choose whether to go ahead, in your own time.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
        <tr><td>
          <a href="${data.invitesUrl}" style="display:inline-block;padding:12px 24px;border-radius:999px;background:#16b8a6;color:#fefefc;text-decoration:none;font-size:14px;font-weight:700;">View the invite</a>
        </td></tr>
      </table>

      <p style="font-size:13px;color:#8a8599;line-height:1.6;margin:0;">
        &copy; 2026 iCare. You're receiving this because you have a published candidate profile on iCare.
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
