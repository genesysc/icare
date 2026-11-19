import { createClient } from "@supabase/supabase-js";
import { sendTransactionalEmail } from "./email";
import { onboardingNudgeEmail } from "./emails/onboarding-nudge";

// One-off "finish your profile" email — migration 0063. Triggered by hand:
// `select onboarding_nudge_ping();` in the database pings
// POST /internal/onboarding-nudge-ping with the shared secret, which this
// forwards to claim_onboarding_nudges() (the real gate). A batch is at most
// 20 members; each member is emailed at most once ever. Not on any cron.

type Env = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SENDER_API_KEY?: string;
  SENDER_FROM_EMAIL?: string;
  SENDER_FROM_NAME?: string;
};

export async function processOnboardingNudges(env: Env, secret: string, siteUrl: string): Promise<{ claimed: number; sent: number }> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.rpc("claim_onboarding_nudges", { p_secret: secret, p_limit: 20 });
  if (error) throw new Error(error.message);

  const rows = (data || []) as Array<{ candidate_id: string; full_name: string; email: string }>;
  let sent = 0;
  for (const row of rows) {
    const { subject, html } = onboardingNudgeEmail(row.full_name, siteUrl);
    const result = await sendTransactionalEmail(env, row.email, subject, html);
    if (result.sent) sent++;
    await supabase.rpc("onboarding_nudge_done", { p_secret: secret, p_candidate_id: row.candidate_id, p_sent: result.sent });
  }
  return { claimed: rows.length, sent };
}
