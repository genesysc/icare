import { Hono } from "hono";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { requireAuth } from "./middleware";

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  AI: Ai;
};

type Variables = {
  supabase: SupabaseClient;
  userId: string;
  user: User;
};

const jobs = new Hono<{ Bindings: Bindings; Variables: Variables }>();
jobs.use("*", requireAuth);

// Sprint 13 (SPRINTS.md "Employer-track reconciliation, 2026-08-30") — the
// jobs module. Never public, never browsable, never candidate-facing, no
// apply button — this does not reopen the "no job postings" decision. Jobs
// exist purely as structured data an invite pulls from, because a valid
// consent request has to be specific and informed (UK GDPR) and carry
// position details before introduction (Conduct Regulations 2003).
//
// Field split matches the CV-parser propose/confirm pattern (non-negotiable
// #5's "propose, never auto-apply" standard, applied here to job copy
// instead of profile data): POST /jobs/draft asks Workers AI to draft
// description_body from the structured fields; nothing is saved until the
// employer explicitly POSTs /jobs with a body they've reviewed (and can
// have edited) themselves.
//
// Sponsorship: mandatory three-state field, not a binary toggle (workflow
// handover §3) — "new_applicant" is additionally blocked at the DB layer
// (0020_jobs.sql's jobs_sponsorship_restricted_roles check) for the two
// professions non-negotiable #8 restricts (care_assistant/senior_carer);
// the check here duplicates that as a friendly 400 instead of a raw
// constraint-violation error, same belt-and-braces pattern as sanitizeParsed()
// in candidates.ts.

const CONTRACT_TYPES = ["permanent", "fixed_term", "locum", "bank"] as const;
const SPONSORSHIP_STATES = ["none", "transitional_switch_only", "new_applicant"] as const;
const SPONSORSHIP_RESTRICTED_PROFESSIONS = ["care_assistant", "senior_carer"] as const;

type JobInput = {
  title: string;
  profession_id: string;
  location: string;
  pay_range: string;
  hours: string;
  contract_type: string;
  notice_period?: string | null;
  qualifications_required?: string | null;
  health_safety_risks?: string | null;
  sponsorship_offered: string;
  description_body?: string | null;
};

function validateJobInput(body: Record<string, unknown>, professionIds: Set<string>): { value?: JobInput; error?: string } {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const professionId = typeof body.profession_id === "string" ? body.profession_id.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const payRange = typeof body.pay_range === "string" ? body.pay_range.trim() : "";
  const hours = typeof body.hours === "string" ? body.hours.trim() : "";
  const contractType = typeof body.contract_type === "string" ? body.contract_type.trim() : "";
  const sponsorshipOffered = typeof body.sponsorship_offered === "string" ? body.sponsorship_offered.trim() : "";

  if (!title) return { error: "title is required" };
  if (!professionId || !professionIds.has(professionId)) return { error: "profession_id must be a real profession id" };
  if (!location) return { error: "location is required" };
  if (!payRange) return { error: "pay_range is required" };
  if (!hours) return { error: "hours is required" };
  if (!(CONTRACT_TYPES as readonly string[]).includes(contractType)) return { error: "contract_type must be one of " + CONTRACT_TYPES.join(", ") };
  if (!(SPONSORSHIP_STATES as readonly string[]).includes(sponsorshipOffered)) return { error: "sponsorship_offered must be one of " + SPONSORSHIP_STATES.join(", ") };
  if (
    sponsorshipOffered === "new_applicant" &&
    (SPONSORSHIP_RESTRICTED_PROFESSIONS as readonly string[]).includes(professionId)
  ) {
    return { error: "New overseas sponsorship isn't available for this role — overseas recruitment for Care Worker and Senior Care Worker roles closed 22 July 2025. Only an existing visa holder switching employer can be sponsored." };
  }

  return {
    value: {
      title,
      profession_id: professionId,
      location,
      pay_range: payRange,
      hours,
      contract_type: contractType,
      notice_period: typeof body.notice_period === "string" ? body.notice_period.trim() || null : null,
      qualifications_required: typeof body.qualifications_required === "string" ? body.qualifications_required.trim() || null : null,
      health_safety_risks: typeof body.health_safety_risks === "string" ? body.health_safety_risks.trim() || null : null,
      sponsorship_offered: sponsorshipOffered,
      description_body: typeof body.description_body === "string" ? body.description_body.trim() || null : null,
    },
  };
}

async function requireVerifiedEmployer(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.rpc("is_verified_employer");
  return !!data;
}

// AI-drafts the one prose field (description_body) from the structured
// fields already entered — a draft to review/edit, never auto-saved. No
// response_format/JSON mode needed here (unlike CV import): this is a
// single free-text field, not a multi-field structured extraction.
jobs.post("/draft", async (c) => {
  const supabase = c.get("supabase");
  if (!(await requireVerifiedEmployer(supabase))) {
    return c.json({ error: "Your organisation needs to be verified before you can draft a job" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const hours = typeof body.hours === "string" ? body.hours.trim() : "";
  const payRange = typeof body.pay_range === "string" ? body.pay_range.trim() : "";
  if (!title) return c.json({ error: "title is required to draft a description" }, 400);

  const systemPrompt =
    "You draft a short, factual job description body for a UK healthcare/social-care role, from the structured details given. " +
    "Plain, professional tone. No salary negotiation language, no evaluative claims about candidates, no promises this job record doesn't state. " +
    "This is a draft the employer will review and can edit before anything is sent to a candidate — do not invent details (benefits, team size, culture claims) that weren't given. " +
    "Respond with only the description text, no headings, no other commentary.";

  const userPrompt = [
    `Role title: ${title}`,
    location ? `Location: ${location}` : null,
    hours ? `Hours: ${hours}` : null,
    payRange ? `Pay: ${payRange}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const result = await c.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 400,
    });
    const draft = typeof result === "object" && result !== null && "response" in result ? (result as { response?: string }).response : undefined;
    if (!draft || !draft.trim()) {
      return c.json({ description_body: "" });
    }
    return c.json({ description_body: draft.trim() });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Draft failed";
    return c.json({ error: errorMessage, description_body: "" }, 500);
  }
});

jobs.post("/", async (c) => {
  const supabase = c.get("supabase");
  const userId = c.get("userId");
  if (!(await requireVerifiedEmployer(supabase))) {
    return c.json({ error: "Your organisation needs to be verified before you can create a job" }, 403);
  }

  const { data: professionsData, error: professionsError } = await supabase.from("professions").select("id");
  if (professionsError) return c.json({ error: professionsError.message }, 400);
  const professionIds = new Set((professionsData || []).map((p) => p.id as string));

  const body = await c.req.json().catch(() => ({}));
  const { value, error } = validateJobInput(body, professionIds);
  if (error || !value) return c.json({ error: error || "Invalid job" }, 400);

  const { data, error: insertError } = await supabase.from("jobs").insert({ employer_id: userId, ...value }).select().single();
  if (insertError) return c.json({ error: insertError.message }, 400);

  return c.json({ job: data }, 201);
});

jobs.get("/", async (c) => {
  const supabase = c.get("supabase");
  const userId = c.get("userId");
  const status = c.req.query("status");

  let query = supabase.from("jobs").select("*").eq("employer_id", userId).order("created_at", { ascending: false });
  if (status === "active" || status === "closed") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ jobs: data });
});

jobs.get("/:id", async (c) => {
  const { data, error } = await c.get("supabase").from("jobs").select("*").eq("id", c.req.param("id")).eq("employer_id", c.get("userId")).single();
  if (error) return c.json({ error: error.message }, 404);
  return c.json({ job: data });
});

jobs.patch("/:id", async (c) => {
  const supabase = c.get("supabase");
  const userId = c.get("userId");
  const jobId = c.req.param("id");

  const { data: existing, error: existingError } = await supabase.from("jobs").select("status").eq("id", jobId).eq("employer_id", userId).single();
  if (existingError) return c.json({ error: existingError.message }, 404);
  if (existing.status === "closed") return c.json({ error: "This job is closed and can't be edited — open a new job instead" }, 400);

  const { data: professionsData, error: professionsError } = await supabase.from("professions").select("id");
  if (professionsError) return c.json({ error: professionsError.message }, 400);
  const professionIds = new Set((professionsData || []).map((p) => p.id as string));

  const body = await c.req.json().catch(() => ({}));
  const { value, error } = validateJobInput(body, professionIds);
  if (error || !value) return c.json({ error: error || "Invalid job" }, 400);

  const { data, error: updateError } = await supabase
    .from("jobs")
    .update({ ...value, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("employer_id", userId)
    .select()
    .single();
  if (updateError) return c.json({ error: updateError.message }, 400);

  return c.json({ job: data });
});

// Closing a job doesn't touch its pipelines here — Sprint 14 wires "job
// closes" into the same access-revocation path as a rejected/withdrawn
// pipeline (HANDOVER.md §14's scoped-and-revocable profile access).
jobs.patch("/:id/close", async (c) => {
  const supabase = c.get("supabase");
  const userId = c.get("userId");
  const jobId = c.req.param("id");

  const { data, error } = await supabase
    .from("jobs")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("employer_id", userId)
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 400);

  // Sprint 15 (HANDOVER.md §14): "the employer's access... revokes" when
  // "the job closes" is one of the three ways a pipeline can close, same
  // as candidate rejected/withdrawn — cascade it here rather than leaving
  // stale open pipelines pointing at a job that no longer exists to invite
  // against.
  await supabase.from("shortlists").update({ closed_at: new Date().toISOString() }).eq("job_id", jobId).is("closed_at", null);

  return c.json({ job: data });
});

export default jobs;
