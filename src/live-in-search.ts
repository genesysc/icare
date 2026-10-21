import { Hono } from "hono";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { requireAuth } from "./middleware";
import { sendTransactionalEmail } from "./email";
import { liveInInviteEmail } from "./emails/live-in-invite";

// Employer-facing live-in search. Deliberately a separate module from the
// chat layer: candidate results render only here, never inside the
// conversational surface (non-negotiable "one rendering surface").
//
// Reads go through live_in_carer_summaries / live_in_carer_details, which
// exclude name/email/phone/postcode until an accepted invite exists. There is
// no ORDER BY rate, fit, score or rank anywhere — recency only. The method
// names and query shape are the enforcement; do not add a "best match" sort.

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SENDER_API_KEY?: string;
  SENDER_FROM_EMAIL?: string;
  SENDER_FROM_NAME?: string;
  NEWS_INGEST_SECRET?: string;
};

type Variables = {
  supabase: SupabaseClient;
  userId: string;
  user: User;
};

const liveInSearch = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const REGIONS = ["london", "south-east", "east", "midlands", "north-west", "north-east", "south-west", "wales", "scotland", "northern-ireland"];
const BLOCKS = ["1w", "2w", "4w", "8w+", "ongoing", "short-cover"];

liveInSearch.get("/carers", requireAuth, async (c) => {
  const supabase = c.get("supabase");
  const region = c.req.query("region") || "";
  const block = c.req.query("block") || "";
  const startBy = c.req.query("startBy") || "";
  const role = c.req.query("role") || "";
  const limit = Math.min(Math.max(Number(c.req.query("limit") || 20), 1), 50);

  let query = supabase
    .from("live_in_carer_summaries")
    .select("*")
    // Non-evaluative order only (non-negotiable #5). Never rate, never score.
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (REGIONS.includes(region)) query = query.contains("regions", [region]);
  if (BLOCKS.includes(block)) query = query.contains("blocks", [block]);
  if (/^\d{4}-\d{2}-\d{2}$/.test(startBy)) query = query.lte("start_date", startBy);
  if (["care-assistant", "senior-care-worker", "nurse-hca", "other"].includes(role)) query = query.eq("role", role);

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ carers: data || [], ordered_by: "updated_at_desc" });
});

liveInSearch.get("/carers/:id", requireAuth, async (c) => {
  const supabase = c.get("supabase");
  const id = c.req.param("id");

  const { data: details } = await supabase.from("live_in_carer_details").select("*").eq("id", id).maybeSingle();
  if (details) return c.json({ access: "full", carer: details });

  const { data: summary, error } = await supabase.from("live_in_carer_summaries").select("*").eq("id", id).maybeSingle();
  if (error) return c.json({ error: error.message }, 400);
  if (!summary) return c.json({ error: "This carer isn't available to view, or has hidden their profile" }, 404);

  return c.json({ access: "summary", carer: summary });
});

liveInSearch.post("/carers/:id/invite", requireAuth, async (c) => {
  const supabase = c.get("supabase");
  const userId = c.get("userId");
  const carerId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  const jobId = typeof body?.job_id === "string" ? body.job_id.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim().slice(0, 1000) : "";
  if (!jobId) return c.json({ error: "Choose the live-in job this invite is for" }, 400);

  // A formal invite must be specific and informed (Conduct Regulations), so it
  // has to point at a real live-in job the employer owns and the job must
  // still be open.
  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, status, live_in_regions")
    .eq("id", jobId)
    .eq("employer_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!job) return c.json({ error: "That job isn't open, or isn't yours" }, 404);
  if (!job.live_in_regions || job.live_in_regions.length === 0) {
    return c.json({ error: "Only live-in job records can invite live-in carers" }, 400);
  }

  const { data: invite, error } = await supabase
    .from("live_in_invites")
    .insert({ carer_id: carerId, job_id: jobId, employer_id: userId, message: message || null })
    .select("id, status, created_at")
    .single();

  if (error) {
    if (error.code === "23505") return c.json({ error: "You've already invited this carer to that job" }, 409);
    return c.json({ error: error.message }, 400);
  }

  // Best-effort notification. The invite itself is already persisted and
  // visible on the carer's own page, so a missing email secret must not fail
  // the request.
  const secret = c.env.NEWS_INGEST_SECRET;
  if (secret) {
    const { data } = await supabase.rpc("live_in_invite_recipient", { p_secret: secret, p_invite_id: invite.id });
    const recipient = Array.isArray(data) ? data[0] : null;
    if (recipient?.to_email) {
      const { subject, html } = liveInInviteEmail({
        displayName: recipient.display_name,
        jobTitle: recipient.job_title,
        jobLocation: recipient.job_location,
        orgName: recipient.org_name,
        message: recipient.message,
        siteUrl: new URL(c.req.url).origin,
      });
      await sendTransactionalEmail(c.env, recipient.to_email, subject, html);
    }
  }

  return c.json({ invite }, 201);
});

export default liveInSearch;
