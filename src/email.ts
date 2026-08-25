// Thin wrapper around Sender.net for transactional email. Deliberately a
// no-op right now: sending needs a verified icare domain in Sender.net
// (only genesysconsultancy.co.uk is verified today), and the user chose
// to wait for that domain rather than send from a stand-in address. This
// keeps /waitlist fully functional (signups are captured either way) and
// makes turning sending on later a config change, not a code change.
//
// To activate once ready:
//   1. Verify the icare domain in Sender.net, grab an API key.
//   2. `wrangler secret put SENDER_API_KEY` (never a plain wrangler.jsonc var — this one's a real secret).
//   3. Add SENDER_FROM_EMAIL to wrangler.jsonc vars (e.g. "hello@icare...").
//   4. Fill in the fetch() call below per Sender.net's current transactional-send API docs.

type Bindings = {
  SENDER_API_KEY?: string;
  SENDER_FROM_EMAIL?: string;
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

  // TODO: wire the real Sender.net transactional-send request here once
  // the domain/API key exist — check current Sender.net API docs for the
  // exact endpoint and payload shape before filling this in.
  console.log(`[email:stub] would send "${subject}" to ${to} from ${env.SENDER_FROM_EMAIL}`);
  return { sent: false };
}
