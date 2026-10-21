import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sendTransactionalEmail } from "./email";
import { liveInAlertEmail } from "./emails/live-in-alert";

// Flushes the live-in alert outbox from the existing 2-hourly cron.
//
// Matching itself happens when the job is created/edited
// (enqueue_live_in_alerts), so this step only delivers already-deduped rows.
// claim_live_in_alerts stamps sent_at as it hands rows over, which is what
// guarantees no carer ever receives the same role twice.
//
// Secret-gated rather than service_role, same as the news ingest. If the
// secret isn't provisioned this is a no-op: rows stay pending in
// live_in_alert_sends and nothing is lost.

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SENDER_API_KEY?: string;
  SENDER_FROM_EMAIL?: string;
  SENDER_FROM_NAME?: string;
  NEWS_INGEST_SECRET?: string;
};

const BLOCK_LABELS: Record<string, string> = {
  "1w": "1 week",
  "2w": "2 weeks",
  "4w": "4 weeks",
  "8w+": "8 weeks or more",
  ongoing: "Ongoing placement",
  "short-cover": "Short cover, 1 to 3 days",
};

type PendingAlert = {
  carer_id: string;
  job_id: string;
  to_email: string;
  display_name: string;
  job_title: string;
  job_location: string | null;
  pay_range: string | null;
  start_date: string | null;
  blocks: string[] | null;
};

export async function flushLiveInAlerts(env: Bindings, siteUrl: string): Promise<{ sent: number }> {
  if (!env.NEWS_INGEST_SECRET) return { sent: 0 };

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.rpc("claim_live_in_alerts", { p_secret: env.NEWS_INGEST_SECRET });
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
        jobTitle: alert.job_title,
        jobLocation: alert.job_location,
        payRange: alert.pay_range,
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
    // Put the rows back so the next cron run retries them.
    for (const alert of alerts) {
      const { error: releaseError } = await supabase.rpc("release_live_in_alert", {
        p_secret: env.NEWS_INGEST_SECRET,
        p_carer_id: alert.carer_id,
        p_job_id: alert.job_id,
      });
      if (releaseError) console.log(`[live-in-alerts] release failed: ${releaseError.message}`);
    }
  }

  return { sent };
}

export async function enqueueLiveInAlerts(
  supabase: SupabaseClient<any, any, any>,
  jobId: string
): Promise<number> {
  const { data, error } = await supabase.rpc("enqueue_live_in_alerts", { p_job_id: jobId } as any);
  if (error) {
    // Never fail job creation over an alert fan-out.
    console.log(`[live-in-alerts] enqueue failed for ${jobId}: ${error.message}`);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}
