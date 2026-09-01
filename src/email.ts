// Thin wrapper around Sender.net's transactional-send REST API
// (POST https://api.sender.net/v2/message/send — confirmed against
// Sender's own current docs, not guessed) for the stage-completion emails
// this project already writes content for (see src/emails/): candidate
// profile published, employer verification submitted/verified.
//
// This is a SEPARATE path from Supabase Auth's own emails (OTP code,
// magic link, password reset) — those are triggered by Supabase itself
// and can only be routed through Sender.net as a custom SMTP relay
// configured in the Supabase Dashboard (Authentication -> Emails -> SMTP
// Settings), not through this function. See HANDOVER.md §8/§6.
//
// icareltd.com is a verified sending domain in Sender.net (SPF/DKIM/DMARC
// all pass, confirmed live via the Sender MCP connector) — the earlier
// domain blocker noted below is resolved.
//
// Still a documented no-op if the secret isn't set: `SENDER_API_KEY` must
// be provisioned via `wrangler secret put SENDER_API_KEY` (never a plain
// wrangler.jsonc var) before this actually sends anything.

type Bindings = {
  SENDER_API_KEY?: string;
  SENDER_FROM_EMAIL?: string;
  SENDER_FROM_NAME?: string;
};

export async function sendTransactionalEmail(
  env: Bindings,
  to: string,
  subject: string,
  html: string
): Promise<{ sent: boolean }> {
  if (!env.SENDER_API_KEY || !env.SENDER_FROM_EMAIL) {
    console.log(`[email:not-configured] would send "${subject}" to ${to}`);
    return { sent: false };
  }

  const res = await fetch("https://api.sender.net/v2/message/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.SENDER_API_KEY}`,
    },
    body: JSON.stringify({
      from: { email: env.SENDER_FROM_EMAIL, name: env.SENDER_FROM_NAME || "iCare" },
      to: { email: to },
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[email:error] Sender.net send failed (${res.status}): ${body}`);
    return { sent: false };
  }

  return { sent: true };
}
