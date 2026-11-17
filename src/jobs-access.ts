import { createClient } from "@supabase/supabase-js";
import { sendTransactionalEmail } from "./email";
import { jobsAccessApprovedEmail, jobsAccessRequestEmail, type JobsAccessRequest } from "./emails/jobs-access";

// Jobs-board access requests — migration 0062, HANDOVER.md §30.
//
// A member taps "Request access"; the database pings POST
// /internal/jobs-access-ping (pg_net) and the 2-hourly cron is the safety
// net. Both call processJobsAccessRequests(), which emails info@ with a
// review link. The link opens a confirm page (routes in index.ts) whose
// Approve / Decline buttons call decide_jobs_access(token).
//
// Sent FROM hello@ TO info@ (info@ is the human-read inbox and must never be
// a sending address — HANDOVER.md §2). The secret is forwarded to the claim
// RPCs, which are the real gate.

export const JOBS_ACCESS_TO = "info@icareltd.com";

type Env = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SENDER_API_KEY?: string;
  SENDER_FROM_EMAIL?: string;
  SENDER_FROM_NAME?: string;
};

export async function processJobsAccessRequests(env: Env, secret: string, siteUrl: string): Promise<{ sent: number }> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.rpc("claim_jobs_access_requests", { p_secret: secret });
  if (error) throw new Error(error.message);

  let sent = 0;
  for (const row of (data || []) as JobsAccessRequest[]) {
    const { subject, html } = jobsAccessRequestEmail(row, siteUrl);
    const result = await sendTransactionalEmail(env, JOBS_ACCESS_TO, subject, html);
    if (result.sent) sent++;
    await supabase.rpc("jobs_access_request_done", { p_secret: secret, p_candidate_id: row.candidate_id, p_sent: result.sent });
  }
  return { sent };
}

export type JobsAccessDecision = { full_name: string; email: string; status: string; changed: boolean };

export async function lookupJobsAccess(env: Env, token: string): Promise<{ full_name: string; status: string } | null> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);
  const { data } = await supabase.rpc("jobs_access_request_by_token", { p_token: token });
  const row = (data as Array<{ full_name: string; status: string }> | null)?.[0];
  return row || null;
}

export async function decideJobsAccess(
  env: Env,
  token: string,
  approve: boolean,
  siteUrl: string
): Promise<JobsAccessDecision | null> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.rpc("decide_jobs_access", { p_token: token, p_approve: approve });
  if (error) throw new Error(error.message);
  const row = (data as JobsAccessDecision[] | null)?.[0];
  if (!row) return null;
  // Tell the member only when this press actually opened the door.
  if (row.changed && row.status === "approved" && row.email) {
    const { subject, html } = jobsAccessApprovedEmail(row.full_name, siteUrl);
    await sendTransactionalEmail(env, row.email, subject, html);
  }
  return row;
}
