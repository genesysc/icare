import { createClient } from "@supabase/supabase-js";
import { sendTransactionalEmail } from "./email";
import { newSignupAlertEmail, type NewSignupAlert } from "./emails/new-signup-alert";

// "New user signed up" alerts to the founder's inbox — migration 0058.
//
// The database pings POST /internal/signup-alert (pg_net, from an AFTER
// INSERT trigger on accounts, plus a 15-minute pg_cron safety net) with a
// shared secret in the body. This handler never stores or checks that
// secret itself: it forwards it to signup_alerts_claim(), which is the
// real gate (SECURITY DEFINER, same pattern as the news ingest RPCs — no
// service_role key anywhere).
//
// Sent FROM hello@ (SENDER_FROM_EMAIL, Sender.net) TO info@ — info@ is the
// human-read Zoho inbox and must never be a sending address
// (HANDOVER.md §2, the 2026-09-10 deliverability incident).

export const SIGNUP_ALERT_TO = "info@icareltd.com";

type Env = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SENDER_API_KEY?: string;
  SENDER_FROM_EMAIL?: string;
  SENDER_FROM_NAME?: string;
};

export async function processSignupAlerts(env: Env, secret: string): Promise<{ claimed: number; sent: number }> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.rpc("signup_alerts_claim", { p_secret: secret });
  if (error) throw new Error(error.message);

  const rows = (data || []) as NewSignupAlert[];
  let sent = 0;
  for (const row of rows) {
    const { subject, html } = newSignupAlertEmail(row);
    const result = await sendTransactionalEmail(env, SIGNUP_ALERT_TO, subject, html);
    if (result.sent) sent++;
    await supabase.rpc("signup_alert_done", { p_secret: secret, p_account_id: row.account_id, p_sent: result.sent });
  }
  return { claimed: rows.length, sent };
}
