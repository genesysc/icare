import { createClient } from "@supabase/supabase-js";
import { sendTransactionalEmail } from "./email";
import { liveInAlertEmail, formatLiveInRate } from "./emails/live-in-alert";
import { liveInInterestEmail, type LiveInInterest } from "./emails/live-in-interest";

// Live-in vacancy alerts and "I'm interested" notifications (migration 0060,
// HANDOVER §29).
//
// iCare uploads each live-in vacancy itself (no employer posting screen yet).
// Inserting an open vacancy queues one alert per opted-in carer in the DB and
// pings POST /internal/live-in-ping; a carer tapping "I'm interested" pings
// it too. The ping (and the 2-hourly cron, as the safety net) runs both
// flushes below.
//
// Secret-gated rather than service_role, same as the news ingest: the secret
// is forwarded to the claim RPCs, which are the real gate.

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SENDER_API_KEY?: string;
  SENDER_FROM_EMAIL?: string;
  SENDER_FROM_NAME?: string;
};

export const LIVE_IN_INTEREST_TO = "info@icareltd.com";

export const BLOCK_LABELS: Record<string, string> = {
  "1w": "1 week",
  "2w": "2 weeks",
  "4w": "4 weeks",
  "8w+": "8 weeks or more",
  ongoing: "Ongoing placement",
  "short-cover": "Short cover, 1 to 3 days",
};

type PendingAlert = {
  carer_id: string;
  vacancy_id: string;
  to_email: string;
  display_name: string;
  title: string;
  area: string;
  rate_basis: string | null;
  rate_pence: number | null;
  rate_note: string | null;
  start_date: string | null;
  blocks: string[] | null;
};

export async function flushLiveInAlerts(env: Bindings, secret: string, siteUrl: string): Promise<{ sent: number }> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.rpc("claim_live_in_alerts", { p_secret: secret });
  if (error) {
    console.log(`[live-in-alerts] claim failed: ${error.message}`);
    return { sent: 0 };
  }

  // One email per carer per run: weekly rows (claimed on Mondays) and any
  // instant rows that arrive together are grouped into a single summary.
  const byCarer = new Map<string, PendingAlert[]>();
  for (const alert of (data || []) as PendingAlert[]) {
    if (!alert.to_email) continue;
    const list = byCarer.get(alert.carer_id) || [];
    list.push(alert);
    byCarer.set(alert.carer_id, list);
  }

  let sent = 0;
  for (const alerts of byCarer.values()) {
    const { subject, html } = liveInAlertEmail({
      displayName: alerts[0].display_name,
      roles: alerts.map((alert) => ({
        title: alert.title,
        area: alert.area,
        rate: formatLiveInRate(alert.rate_basis, alert.rate_pence, alert.rate_note),
        startDate: alert.start_date,
        blocks: (alert.blocks || []).map((block) => BLOCK_LABELS[block] || block).join(", "),
      })),
      siteUrl,
    });
    const result = await sendTransactionalEmail(env, alerts[0].to_email, subject, html);
    if (result.sent) {
      sent += 1;
      continue;
    }
    // Put the rows back so the next ping / cron run retries them.
    for (const alert of alerts) {
      const { error: releaseError } = await supabase.rpc("release_live_in_alert", {
        p_secret: secret,
        p_carer_id: alert.carer_id,
        p_vacancy_id: alert.vacancy_id,
      });
      if (releaseError) console.log(`[live-in-alerts] release failed: ${releaseError.message}`);
    }
  }

  return { sent };
}

// "I'm interested" -> email info@ with the carer's details for that vacancy.
export async function flushLiveInInterest(env: Bindings, secret: string): Promise<{ sent: number }> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.rpc("claim_live_in_interest", { p_secret: secret });
  if (error) {
    console.log(`[live-in-interest] claim failed: ${error.message}`);
    return { sent: 0 };
  }

  let sent = 0;
  for (const row of (data || []) as LiveInInterest[]) {
    const { subject, html } = liveInInterestEmail(row);
    const result = await sendTransactionalEmail(env, LIVE_IN_INTEREST_TO, subject, html);
    if (result.sent) sent += 1;
    await supabase.rpc("live_in_interest_done", {
      p_secret: secret,
      p_vacancy_id: row.vacancy_id,
      p_carer_id: row.carer_id,
      p_sent: result.sent,
    });
  }
  return { sent };
}

export async function flushLiveIn(env: Bindings, secret: string, siteUrl: string) {
  const [alerts, interest] = await Promise.all([
    flushLiveInAlerts(env, secret, siteUrl),
    flushLiveInInterest(env, secret),
  ]);
  return { alerts: alerts.sent, interest: interest.sent };
}
