// Thin wrapper around Sender.net for transactional email. Deliberately a
// no-op right now: sending needs a verified icare domain in Sender.net
// (only genesysconsultancy.co.uk is verified today), and the user chose
// to wait for that domain rather than send from a stand-in address. This
// keeps /waitlist fully functional (signups are captured either way) and
// makes turning sending on later a config change, not a code change.
//
// The stage-completion email content this now sends into (candidate
// profile published, employer verification submitted/verified — see
// src/emails/) is already written and wired at its call sites
// (src/candidates.ts, src/employers.ts) — it's only this function's actual
// API call that's still a stub. Tried to fill it in for real on 2026-08-26
// and hit a hard wall: the Sender MCP connector was disconnected
// mid-session (can't inspect the live account), and WebFetch to
// api.sender.net / www.sender.net / developers.sender.net all came back
// EGRESS_BLOCKED from this sandbox's network proxy — the same class of
// restriction that blocks *.supabase.co and api.anthropic.com elsewhere in
// this build. Never guessed the request shape to work around it — that's
// exactly the kind of API-shape guess this project's conventions forbid.
//
// To activate once ready:
//   1. Verify the icare domain in Sender.net, grab an API key.
//   2. `wrangler secret put SENDER_API_KEY` (never a plain wrangler.jsonc var — this one's a real secret).
//   3. Add SENDER_FROM_EMAIL to wrangler.jsonc vars (e.g. "hello@icare...").
//   4. Fill in the fetch() call below per Sender.net's current transactional-send API docs —
//      get real docs either via the Sender MCP connector (reconnect it) or by pasting the
//      relevant API reference directly; do not guess the request shape.
//   5. employer-verified.ts also needs a real trigger: is_verified is only ever flipped by a
//      manual Supabase dashboard edit today, with no API call behind it to hook a send into.
//      That needs either a Postgres database webhook (employers.is_verified -> true, calling a
//      new Worker route) or a proper admin review route — ask the founder which, don't assume.

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
