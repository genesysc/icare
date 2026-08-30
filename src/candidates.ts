import { Hono } from "hono";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "./middleware";
import { sendTransactionalEmail } from "./email";
import { candidateProfilePublishedEmail } from "./emails/candidate-profile-published";

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  MEDIA: R2Bucket;
  AI: Ai;
  SENDER_API_KEY?: string;
  SENDER_FROM_EMAIL?: string;
};

type Variables = {
  supabase: SupabaseClient;
  userId: string;
};

const candidates = new Hono<{ Bindings: Bindings; Variables: Variables }>();

candidates.use("*", requireAuth);

// Only these candidates columns are directly client-writable. Fields like
// is_published, completeness, onboarding_done are owned by
// publish_my_profile() / onboarding triggers in the DB, not the client.
const WRITABLE_FIELDS = [
  "headline",
  "about",
  "proud_of",
  "postcode_district",
  "town",
  "travel_radius_miles",
  "willing_to_relocate",
  "right_to_work",
  "visa_expiry",
  "has_driving_licence",
  "has_own_vehicle",
  "availability",
  "available_from",
  "shift_prefs",
  "min_hourly_rate",
] as const;

candidates.get("/me", async (c) => {
  const { data, error } = await c
    .get("supabase")
    .from("candidates")
    .select("*")
    .eq("id", c.get("userId"))
    .single();

  if (error) return c.json({ error: error.message }, 404);
  return c.json({ candidate: data });
});

candidates.patch("/me", async (c) => {
  const body = await c.req.json();
  const update: Record<string, unknown> = {};
  for (const field of WRITABLE_FIELDS) {
    if (field in body) update[field] = body[field];
  }
  if (Object.keys(update).length === 0) {
    return c.json({ error: "no writable fields in body" }, 400);
  }

  const { data, error } = await c
    .get("supabase")
    .from("candidates")
    .update(update)
    .eq("id", c.get("userId"))
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ candidate: data });
});

// --- Onboarding progress (SPRINTS.md Sprint 2) ---
// The wizard spans several sprints (Sprint 2: basics/skills/availability,
// Sprint 3: work history/quals/registrations, Sprint 4: DBS/refs/prompts,
// Sprint 5: photo/review/publish) — onboarding_step is a single monotonic
// counter across all of it, onboarding_done only flips true at the very
// end (Sprint 5), not after any individual sprint's steps.

candidates.post("/me/onboarding/advance", async (c) => {
  const body = await c.req.json().catch(() => null);
  const step = typeof body?.step === "number" ? body.step : null;
  const event = typeof body?.event === "string" ? body.event : "advanced";
  if (step === null || !Number.isInteger(step) || step < 1) {
    return c.json({ error: "step must be a positive integer" }, 400);
  }

  const supabase = c.get("supabase");
  const userId = c.get("userId");

  const { data: current, error: readError } = await supabase
    .from("candidates")
    .select("onboarding_step")
    .eq("id", userId)
    .single();
  if (readError) return c.json({ error: readError.message }, 400);

  const nextStep = Math.max(current.onboarding_step, step);
  const { data, error } = await supabase
    .from("candidates")
    .update({ onboarding_step: nextStep })
    .eq("id", userId)
    .select("onboarding_step")
    .single();
  if (error) return c.json({ error: error.message }, 400);

  const { error: eventError } = await supabase
    .from("onboarding_events")
    .insert({ candidate_id: userId, step, event });
  if (eventError) return c.json({ error: eventError.message }, 400);

  return c.json({ onboarding_step: data.onboarding_step });
});

candidates.post("/me/onboarding/complete", async (c) => {
  const supabase = c.get("supabase");
  const userId = c.get("userId");

  const { data, error } = await supabase
    .from("candidates")
    .update({ onboarding_done: true })
    .eq("id", userId)
    .select("onboarding_done, onboarding_step")
    .single();
  if (error) return c.json({ error: error.message }, 400);

  await supabase.from("onboarding_events").insert({
    candidate_id: userId,
    step: data.onboarding_step,
    event: "completed",
  });

  return c.json({ onboarding_done: data.onboarding_done });
});

candidates.post("/me/publish", async (c) => {
  const supabase = c.get("supabase");
  const { data, error } = await supabase.rpc("publish_my_profile");
  if (error) return c.json({ error: error.message }, 400);

  if (data) {
    const { data: account } = await supabase.from("accounts").select("full_name, email").eq("id", c.get("userId")).single();
    if (account) {
      const { subject, html } = candidateProfilePublishedEmail({
        fullName: account.full_name,
        dashboardUrl: new URL(c.req.url).origin + "/dashboard",
      });
      await sendTransactionalEmail(c.env, account.email, subject, html);
    }
  }

  return c.json({ published: data });
});

candidates.post("/me/photo", async (c) => {
  const contentType = c.req.header("Content-Type");
  if (!contentType?.startsWith("image/")) {
    return c.json({ error: "Content-Type must be an image/* type" }, 400);
  }

  const userId = c.get("userId");
  const key = `candidates/${userId}/photo`;
  const body = await c.req.arrayBuffer();
  await c.env.MEDIA.put(key, body, { httpMetadata: { contentType } });

  const { data, error } = await c
    .get("supabase")
    .from("candidates")
    .update({ photo_path: key })
    .eq("id", userId)
    .select("photo_path")
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ candidate: data });
});

// GET-back for the photo the candidate just uploaded — scoped to their own
// key (never a general /media/:key route, so there's no key-enumeration
// surface). Good enough for the wizard/dashboard to preview it; a
// consent-gated route for employers to view it after shortlist is later
// scope, not this sprint's.
candidates.get("/me/photo", async (c) => {
  const userId = c.get("userId");
  const object = await c.env.MEDIA.get(`candidates/${userId}/photo`);
  if (!object) return c.json({ error: "No photo uploaded" }, 404);

  return new Response(object.body, {
    headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream" },
  });
});

// --- Intro video (Sprint 9 remainder) — same pattern as photo above.
// candidates.intro_video_path has existed since 0001_init but nothing ever
// wrote or served it; needed now so shortlist consent (Sprint 9) has an
// actual video to unlock for employers, not just an empty column.
candidates.post("/me/video", async (c) => {
  const contentType = c.req.header("Content-Type");
  if (!contentType?.startsWith("video/")) {
    return c.json({ error: "Content-Type must be a video/* type" }, 400);
  }

  const userId = c.get("userId");
  const key = `candidates/${userId}/video`;
  const body = await c.req.arrayBuffer();
  if (body.byteLength > 100 * 1024 * 1024) return c.json({ error: "File too large — 100MB maximum" }, 400);
  await c.env.MEDIA.put(key, body, { httpMetadata: { contentType } });

  const { data, error } = await c
    .get("supabase")
    .from("candidates")
    .update({ intro_video_path: key })
    .eq("id", userId)
    .select("intro_video_path")
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ candidate: data });
});

candidates.get("/me/video", async (c) => {
  const userId = c.get("userId");
  const object = await c.env.MEDIA.get(`candidates/${userId}/video`);
  if (!object) return c.json({ error: "No video uploaded" }, 404);

  return new Response(object.body, {
    headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream" },
  });
});

candidates.delete("/me/video", async (c) => {
  const userId = c.get("userId");
  await c.env.MEDIA.delete(`candidates/${userId}/video`);

  const { data, error } = await c
    .get("supabase")
    .from("candidates")
    .update({ intro_video_path: null })
    .eq("id", userId)
    .select("intro_video_path")
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ candidate: data });
});

// --- Professions (candidate's own set, replace-whole-set semantics) ---

candidates.get("/me/professions", async (c) => {
  const { data, error } = await c
    .get("supabase")
    .from("candidate_professions")
    .select("profession_id, is_primary, professions(id, name, family, regulator)")
    .eq("candidate_id", c.get("userId"));

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ professions: data });
});

candidates.put("/me/professions", async (c) => {
  const body = await c.req.json();
  const professionIds: unknown = body.profession_ids;
  const primaryId: unknown = body.primary_id;
  if (!Array.isArray(professionIds)) {
    return c.json({ error: "profession_ids must be an array" }, 400);
  }

  const supabase = c.get("supabase");
  const userId = c.get("userId");

  const { error: deleteError } = await supabase
    .from("candidate_professions")
    .delete()
    .eq("candidate_id", userId);
  if (deleteError) return c.json({ error: deleteError.message }, 400);

  if (professionIds.length === 0) return c.json({ professions: [] });

  const rows = professionIds.map((profession_id) => ({
    candidate_id: userId,
    profession_id,
    is_primary: profession_id === primaryId,
  }));

  const { data, error } = await supabase.from("candidate_professions").insert(rows).select();
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ professions: data });
});

// --- Skills (same replace-whole-set pattern) ---

candidates.get("/me/skills", async (c) => {
  const { data, error } = await c
    .get("supabase")
    .from("candidate_skills")
    .select("skill_id, clinical_skills(id, label, family)")
    .eq("candidate_id", c.get("userId"));

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ skills: data });
});

candidates.put("/me/skills", async (c) => {
  const body = await c.req.json();
  const skillIds: unknown = body.skill_ids;
  if (!Array.isArray(skillIds)) {
    return c.json({ error: "skill_ids must be an array" }, 400);
  }

  const supabase = c.get("supabase");
  const userId = c.get("userId");

  const { error: deleteError } = await supabase
    .from("candidate_skills")
    .delete()
    .eq("candidate_id", userId);
  if (deleteError) return c.json({ error: deleteError.message }, 400);

  if (skillIds.length === 0) return c.json({ skills: [] });

  const rows = skillIds.map((skill_id) => ({ candidate_id: userId, skill_id }));
  const { data, error } = await supabase.from("candidate_skills").insert(rows).select();
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ skills: data });
});

// --- Employment history (independent records, full CRUD) ---

const EMPLOYMENT_FIELDS = [
  "employer",
  "job_title",
  "setting",
  "started_on",
  "ended_on",
  "is_current",
  "description",
  "sort_order",
] as const;

candidates.get("/me/employment-history", async (c) => {
  const { data, error } = await c
    .get("supabase")
    .from("employment_history")
    .select("*")
    .eq("candidate_id", c.get("userId"))
    .order("sort_order", { ascending: true });

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ employment_history: data });
});

candidates.post("/me/employment-history", async (c) => {
  const body = await c.req.json();
  const insert: Record<string, unknown> = { candidate_id: c.get("userId") };
  for (const field of EMPLOYMENT_FIELDS) {
    if (field in body) insert[field] = body[field];
  }

  const { data, error } = await c
    .get("supabase")
    .from("employment_history")
    .insert(insert)
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ employment_history: data }, 201);
});

candidates.patch("/me/employment-history/:id", async (c) => {
  const body = await c.req.json();
  const update: Record<string, unknown> = {};
  for (const field of EMPLOYMENT_FIELDS) {
    if (field in body) update[field] = body[field];
  }
  if (Object.keys(update).length === 0) {
    return c.json({ error: "no writable fields in body" }, 400);
  }

  const { data, error } = await c
    .get("supabase")
    .from("employment_history")
    .update(update)
    .eq("id", c.req.param("id"))
    .eq("candidate_id", c.get("userId"))
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ employment_history: data });
});

candidates.delete("/me/employment-history/:id", async (c) => {
  const { error } = await c
    .get("supabase")
    .from("employment_history")
    .delete()
    .eq("id", c.req.param("id"))
    .eq("candidate_id", c.get("userId"));

  if (error) return c.json({ error: error.message }, 400);
  return c.body(null, 204);
});

// --- Qualifications (SPRINTS.md Sprint 3) ---
// status is server-owned: starts "none" (DB default) until evidence is
// uploaded, then moves to "submitted" — review happens manually via the
// Supabase dashboard for now (no reviewer UI yet).

const QUALIFICATION_FIELDS = ["type_id", "title", "awarding_body", "awarded_on", "expires_on"] as const;

candidates.get("/me/qualifications", async (c) => {
  const { data, error } = await c
    .get("supabase")
    .from("qualifications")
    .select("*")
    .eq("candidate_id", c.get("userId"))
    .order("awarded_on", { ascending: false });

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ qualifications: data });
});

candidates.post("/me/qualifications", async (c) => {
  const body = await c.req.json();
  const insert: Record<string, unknown> = { candidate_id: c.get("userId") };
  for (const field of QUALIFICATION_FIELDS) {
    if (field in body) insert[field] = body[field];
  }

  const { data, error } = await c.get("supabase").from("qualifications").insert(insert).select().single();
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ qualification: data }, 201);
});

candidates.patch("/me/qualifications/:id", async (c) => {
  const body = await c.req.json();
  const update: Record<string, unknown> = {};
  for (const field of QUALIFICATION_FIELDS) {
    if (field in body) update[field] = body[field];
  }
  if (Object.keys(update).length === 0) {
    return c.json({ error: "no writable fields in body" }, 400);
  }

  const { data, error } = await c
    .get("supabase")
    .from("qualifications")
    .update(update)
    .eq("id", c.req.param("id"))
    .eq("candidate_id", c.get("userId"))
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ qualification: data });
});

candidates.delete("/me/qualifications/:id", async (c) => {
  const { error } = await c
    .get("supabase")
    .from("qualifications")
    .delete()
    .eq("id", c.req.param("id"))
    .eq("candidate_id", c.get("userId"));

  if (error) return c.json({ error: error.message }, 400);
  return c.body(null, 204);
});

candidates.post("/me/qualifications/:id/evidence", async (c) => {
  const contentType = c.req.header("Content-Type");
  if (!contentType || !(contentType.startsWith("image/") || contentType === "application/pdf")) {
    return c.json({ error: "Content-Type must be an image/* type or application/pdf" }, 400);
  }

  const userId = c.get("userId");
  const qualificationId = c.req.param("id");
  const supabase = c.get("supabase");

  const { data: current, error: readError } = await supabase
    .from("qualifications")
    .select("status")
    .eq("id", qualificationId)
    .eq("candidate_id", userId)
    .single();
  if (readError) return c.json({ error: readError.message }, 404);

  const key = `candidates/${userId}/qualifications/${qualificationId}/evidence`;
  const body = await c.req.arrayBuffer();
  await c.env.MEDIA.put(key, body, { httpMetadata: { contentType } });

  const nextStatus = current.status === "none" ? "submitted" : current.status;
  const { data, error } = await supabase
    .from("qualifications")
    .update({ evidence_path: key, status: nextStatus })
    .eq("id", qualificationId)
    .eq("candidate_id", userId)
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ qualification: data });
});

// --- Registrations (SPRINTS.md Sprint 3) ---
// status defaults to "submitted" (DB default) — a registration is a
// factual claim (regulator + reg number) the candidate is making up
// front, unlike a qualification which starts unevidenced. Review still
// happens manually via the Supabase dashboard for now.

const REGISTRATION_FIELDS = ["regulator", "reg_number", "register_name", "expires_on"] as const;

candidates.get("/me/registrations", async (c) => {
  const { data, error } = await c
    .get("supabase")
    .from("registrations")
    .select("*")
    .eq("candidate_id", c.get("userId"));

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ registrations: data });
});

candidates.post("/me/registrations", async (c) => {
  const body = await c.req.json();
  const insert: Record<string, unknown> = { candidate_id: c.get("userId") };
  for (const field of REGISTRATION_FIELDS) {
    if (field in body) insert[field] = body[field];
  }

  const { data, error } = await c.get("supabase").from("registrations").insert(insert).select().single();
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ registration: data }, 201);
});

candidates.patch("/me/registrations/:id", async (c) => {
  const body = await c.req.json();
  const update: Record<string, unknown> = {};
  for (const field of REGISTRATION_FIELDS) {
    if (field in body) update[field] = body[field];
  }
  if (Object.keys(update).length === 0) {
    return c.json({ error: "no writable fields in body" }, 400);
  }

  const { data, error } = await c
    .get("supabase")
    .from("registrations")
    .update(update)
    .eq("id", c.req.param("id"))
    .eq("candidate_id", c.get("userId"))
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ registration: data });
});

candidates.delete("/me/registrations/:id", async (c) => {
  const { error } = await c
    .get("supabase")
    .from("registrations")
    .delete()
    .eq("id", c.req.param("id"))
    .eq("candidate_id", c.get("userId"));

  if (error) return c.json({ error: error.message }, 400);
  return c.body(null, 204);
});

// --- DBS status + consent (SPRINTS.md Sprint 4) ---
// One row per candidate (candidate_id is the primary key), so this is an
// upsert, not list CRUD. consent_given_at is server-owned: it's stamped
// the moment consent_to_check first flips true, and cleared if consent is
// withdrawn — never client-supplied, so it's an honest record of when
// consent was actually given, not just claimed.

const DBS_FIELDS = ["level", "issued_on", "certificate_number", "workforce"] as const;

candidates.get("/me/dbs", async (c) => {
  const { data, error } = await c
    .get("supabase")
    .from("dbs_records")
    .select("*")
    .eq("candidate_id", c.get("userId"))
    .maybeSingle();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ dbs: data });
});

candidates.put("/me/dbs", async (c) => {
  const body = await c.req.json();
  const userId = c.get("userId");
  const supabase = c.get("supabase");

  const { data: current, error: readError } = await supabase
    .from("dbs_records")
    .select("consent_to_check, consent_given_at")
    .eq("candidate_id", userId)
    .maybeSingle();
  if (readError) return c.json({ error: readError.message }, 400);

  const consentRequested = body.consent_to_check === true;
  const update: Record<string, unknown> = { candidate_id: userId, consent_to_check: consentRequested };
  for (const field of DBS_FIELDS) {
    if (field in body) update[field] = body[field];
  }
  if (consentRequested) {
    update.consent_given_at = current?.consent_to_check ? current.consent_given_at : new Date().toISOString();
  } else {
    update.consent_given_at = null;
  }

  const { data, error } = await supabase
    .from("dbs_records")
    .upsert(update, { onConflict: "candidate_id" })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ dbs: data });
});

// --- References (SPRINTS.md Sprint 4) ---
// Collects referee details only. Reg 22 (non-negotiable #7) requires two
// references confirmed *before a placement*, not before publish — the
// actual referee-response flow (token, outbound email) is deferred to a
// later sprint since it needs real outbound email, blocked on the parked
// domain/Sender.net work.

const REFERENCE_FIELDS = ["referee_name", "referee_org", "referee_email", "relationship"] as const;

candidates.get("/me/references", async (c) => {
  const { data, error } = await c
    .get("supabase")
    .from("candidate_references")
    .select("*")
    .eq("candidate_id", c.get("userId"));

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ references: data });
});

candidates.post("/me/references", async (c) => {
  const body = await c.req.json();
  const insert: Record<string, unknown> = { candidate_id: c.get("userId") };
  for (const field of REFERENCE_FIELDS) {
    if (field in body) insert[field] = body[field];
  }

  const { data, error } = await c.get("supabase").from("candidate_references").insert(insert).select().single();
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ reference: data }, 201);
});

candidates.patch("/me/references/:id", async (c) => {
  const body = await c.req.json();
  const update: Record<string, unknown> = {};
  for (const field of REFERENCE_FIELDS) {
    if (field in body) update[field] = body[field];
  }
  if (Object.keys(update).length === 0) {
    return c.json({ error: "no writable fields in body" }, 400);
  }

  const { data, error } = await c
    .get("supabase")
    .from("candidate_references")
    .update(update)
    .eq("id", c.req.param("id"))
    .eq("candidate_id", c.get("userId"))
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ reference: data });
});

candidates.delete("/me/references/:id", async (c) => {
  const { error } = await c
    .get("supabase")
    .from("candidate_references")
    .delete()
    .eq("id", c.req.param("id"))
    .eq("candidate_id", c.get("userId"));

  if (error) return c.json({ error: error.message }, 400);
  return c.body(null, 204);
});

// --- Self-expression prompts (SPRINTS.md Sprint 4) ---
// One row per (candidate_id, prompt_id) — answering a prompt is an
// upsert, clearing it is a delete. Answering any given prompt is
// optional; there's no "must answer N of them" requirement.

candidates.get("/me/prompts", async (c) => {
  const { data, error } = await c
    .get("supabase")
    .from("candidate_prompts")
    .select("prompt_id, answer, updated_at")
    .eq("candidate_id", c.get("userId"));

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ prompts: data });
});

candidates.put("/me/prompts/:promptId", async (c) => {
  const body = await c.req.json();
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (!answer) return c.json({ error: "answer must not be empty" }, 400);

  const { data, error } = await c
    .get("supabase")
    .from("candidate_prompts")
    .upsert(
      { candidate_id: c.get("userId"), prompt_id: c.req.param("promptId"), answer, updated_at: new Date().toISOString() },
      { onConflict: "candidate_id,prompt_id" },
    )
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ prompt: data });
});

candidates.delete("/me/prompts/:promptId", async (c) => {
  const { error } = await c
    .get("supabase")
    .from("candidate_prompts")
    .delete()
    .eq("candidate_id", c.get("userId"))
    .eq("prompt_id", c.req.param("promptId"));

  if (error) return c.json({ error: error.message }, 400);
  return c.body(null, 204);
});

// --- Posts (candidate's own professional stories/opinions/experiences) ---
// No topic restriction and no pre-publish review, by design (founder,
// 2026-08-26 chat) — candidates are trusted the same way a LinkedIn author
// is. Moderation is report-then-manual, matching this codebase's existing
// pattern of manual review via the Supabase dashboard (see employer
// verification): an employer can call flag_candidate_post() (src/employers.ts),
// which just sets is_flagged — nothing here polices content up front.

const POST_FIELDS = ["title", "body"] as const;

candidates.get("/me/posts", async (c) => {
  const { data, error } = await c
    .get("supabase")
    .from("candidate_posts")
    .select("*")
    .eq("candidate_id", c.get("userId"))
    .order("created_at", { ascending: false });

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ posts: data });
});

candidates.post("/me/posts", async (c) => {
  const body = await c.req.json();
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) return c.json({ error: "body is required" }, 400);
  if (text.length > 8000) return c.json({ error: "Post is too long — 8000 characters maximum" }, 400);

  const insert: Record<string, unknown> = { candidate_id: c.get("userId"), body: text };
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title) insert.title = title;

  const { data, error } = await c.get("supabase").from("candidate_posts").insert(insert).select().single();
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ post: data }, 201);
});

candidates.patch("/me/posts/:id", async (c) => {
  const body = await c.req.json();
  const update: Record<string, unknown> = {};
  for (const field of POST_FIELDS) {
    if (field in body) update[field] = typeof body[field] === "string" ? body[field].trim() : body[field];
  }
  if (typeof update.body === "string" && (!update.body || update.body.length > 8000)) {
    return c.json({ error: "body must be 1-8000 characters" }, 400);
  }
  if (Object.keys(update).length === 0) {
    return c.json({ error: "no writable fields in body" }, 400);
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await c
    .get("supabase")
    .from("candidate_posts")
    .update(update)
    .eq("id", c.req.param("id"))
    .eq("candidate_id", c.get("userId"))
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ post: data });
});

candidates.delete("/me/posts/:id", async (c) => {
  const { error } = await c
    .get("supabase")
    .from("candidate_posts")
    .delete()
    .eq("id", c.req.param("id"))
    .eq("candidate_id", c.get("userId"));

  if (error) return c.json({ error: error.message }, 400);
  return c.body(null, 204);
});

// --- Incoming shortlists + consent (SPRINTS.md Sprint 9 remainder) ---
// Consent unlocks photo/video/CV specifically for that employer — name/
// job title/location are already visible pre-shortlist per non-negotiable
// #4's dated override, so this consent is scoped narrower than the
// original design. Full contact details and the DBS certificate number
// are deliberately NOT exposed by anything in this file — non-negotiable
// #7 wants those confirmed before an actual placement, not just on
// shortlist, and that placement-confirmation flow doesn't exist yet.

candidates.get("/me/shortlists", async (c) => {
  const { data, error } = await c
    .get("supabase")
    .from("shortlists")
    .select("id, employer_id, job_id, job_snapshot, stage, created_at, candidate_consented_at, employers(org_name)")
    .eq("candidate_id", c.get("userId"))
    .order("created_at", { ascending: false });

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ shortlists: data });
});

candidates.post("/me/shortlists/:employerId/consent", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const consent = body?.consent !== false;

  const { error } = await c.get("supabase").rpc("set_shortlist_consent", {
    p_employer_id: c.req.param("employerId"),
    p_consent: consent,
  });
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ consented: consent });
});

// --- Badges (SPRINTS.md Sprint 5) ---
// Read-only, always — non-negotiable #2 forbids any client write path to
// candidate_badges. publish_my_profile() and refresh_experience_badges()
// (both DB-side) are the only things that ever insert here.

candidates.get("/me/badges", async (c) => {
  const { data, error } = await c
    .get("supabase")
    .from("candidate_badges")
    .select("badge_code, awarded_at, expires_at, badges(code, label, grade, family, description)")
    .eq("candidate_id", c.get("userId"));

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ badges: data });
});

// --- Account settings (SPRINTS.md Sprint 5) ---

candidates.post("/me/close-account", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" ? body.reason : null;

  const { error } = await c.get("supabase").rpc("close_my_account", { p_reason: reason });
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ closed: true });
});

// --- CV import (upload a PDF, parse it into a draft, candidate reviews and
// confirms before anything is saved to their profile) ---
//
// Runs entirely on Workers AI (env.AI) rather than a metered third-party API
// — no separate vendor account or API key, and it draws from the same
// Cloudflare account's free daily Neuron allocation. Two calls:
// (1) env.AI.toMarkdown() extracts plain text from the PDF (this step alone
//     doesn't invoke a model for text-based PDFs — only embedded-image
//     description would, and that's explicitly turned off below so an
//     embedded photo is never described or reasoned about at all);
// (2) env.AI.run() on a text model (@cf/meta/llama-3.3-70b-instruct-fp8-fast)
//     extracts structured JSON from that text via JSON mode.
//
// Non-negotiable #5: AI never auto-applies a parse — this route only ever
// writes to cv_imports. The candidate's own review screen calls the SAME
// existing routes above (PATCH /me, PUT /me/professions, POST /me/
// employment-history, etc.) to actually save anything, exactly as if they'd
// typed it in by hand. mark-applied below is just a record of that having
// happened, not a write path of its own.
//
// Non-negotiable #6: the model is explicitly told never to extract DOB,
// nationality, immigration status, marital status, gender, religion,
// ethnicity, health info, or NI numbers — only to note that a category was
// present (sensitive_found), never the value. Disabling embedded-image
// conversion (above) is the same principle applied to an embedded photo.
//
// profession_ids/skill_ids/qualification type_id are listed in the prompt
// as the only allowed values, but — unlike Claude's forced tool-use with a
// strict enum-constrained schema — an open-weight model's JSON mode isn't
// guaranteed to honor that constraint. sanitizeParsed() below is the actual
// guarantee: every id the model returns is checked against the real
// reference-table ids (fetched fresh on every parse) and dropped if it
// doesn't match, so invalid/hallucinated ids can never reach cv_imports,
// regardless of what the model actually output.

const SENSITIVE_CATEGORIES = [
  "date_of_birth",
  "nationality",
  "immigration_status",
  "marital_status",
  "gender",
  "religion",
  "ethnicity",
  "health_information",
  "ni_number",
  "photo",
] as const;

const REGULATORS = ["nmc", "hcpc", "gdc", "gmc", "gphc", "swe", "goc"] as const;
const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function filterAllowedIds(v: unknown, allowed: Set<string>): string[] {
  return asArray(v).filter((id): id is string => typeof id === "string" && allowed.has(id));
}

// Defense-in-depth sanitizer — see the comment block above. Never trusts the
// model's output shape; every field is individually validated/coerced, and
// anything that doesn't hold up is dropped rather than passed through.
function sanitizeParsed(raw: Record<string, unknown>, professionIds: Set<string>, skillIds: Set<string>, qualTypeIds: Set<string>) {
  const employmentHistory = asArray(raw.employment_history)
    .map((item) => {
      if (typeof item !== "object" || item === null) return null;
      const rec = item as Record<string, unknown>;
      const employer = asString(rec.employer);
      const jobTitle = asString(rec.job_title);
      if (!employer || !jobTitle) return null;
      return {
        employer,
        job_title: jobTitle,
        setting: asString(rec.setting),
        started_on: asString(rec.started_on),
        ended_on: asString(rec.ended_on),
        is_current: rec.is_current === true,
        description: asString(rec.description),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const qualifications = asArray(raw.qualifications)
    .map((item) => {
      if (typeof item !== "object" || item === null) return null;
      const rec = item as Record<string, unknown>;
      const title = asString(rec.title);
      if (!title) return null;
      const typeId = asString(rec.type_id);
      return {
        type_id: typeId && qualTypeIds.has(typeId) ? typeId : null,
        title,
        awarding_body: asString(rec.awarding_body),
        awarded_on: asString(rec.awarded_on),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  let registration: { regulator: string; reg_number: string; register_name: string | null } | null = null;
  if (raw.registration && typeof raw.registration === "object") {
    const rec = raw.registration as Record<string, unknown>;
    const regulator = asString(rec.regulator);
    const regNumber = asString(rec.reg_number);
    if (regulator && regNumber && (REGULATORS as readonly string[]).includes(regulator)) {
      registration = { regulator, reg_number: regNumber, register_name: asString(rec.register_name) };
    }
  }

  const sensitiveFound = asArray(raw.sensitive_categories_noticed).filter(
    (cat): cat is string => typeof cat === "string" && (SENSITIVE_CATEGORIES as readonly string[]).includes(cat),
  );

  const confidence = asString(raw.overall_confidence);
  const overallConfidence = confidence && (CONFIDENCE_LEVELS as readonly string[]).includes(confidence) ? confidence : "low";

  return {
    headline: asString(raw.headline),
    about: asString(raw.about),
    town: asString(raw.town),
    profession_ids: filterAllowedIds(raw.profession_ids, professionIds),
    skill_ids: filterAllowedIds(raw.skill_ids, skillIds),
    employment_history: employmentHistory,
    qualifications,
    registration,
    sensitive_categories_noticed: sensitiveFound,
    overall_confidence: overallConfidence,
  };
}

const CV_EXTRACT_SCHEMA = {
  type: "object",
  required: [
    "headline",
    "about",
    "town",
    "profession_ids",
    "skill_ids",
    "employment_history",
    "qualifications",
    "registration",
    "sensitive_categories_noticed",
    "overall_confidence",
  ],
  properties: {
    headline: { type: ["string", "null"], description: "A short professional headline, e.g. their most recent job title + years of experience. Null if not inferable." },
    about: { type: ["string", "null"], description: "A short first-person-style summary, only if the CV has a personal statement/summary section to draw from. Null otherwise — never invent one." },
    town: { type: ["string", "null"], description: "Town/city only, from any address on the CV. Never the full address or postcode." },
    profession_ids: { type: "array", items: { type: "string" }, description: "0-3 closest-matching profession ids from the allowed list below, most senior/recent first. Empty array if nothing matches reasonably." },
    skill_ids: { type: "array", items: { type: "string" }, description: "Clinical skill ids from the allowed list below that the CV clearly evidences. Empty array if none." },
    employment_history: {
      type: "array",
      description: "Every distinct role found, most recent first.",
      items: {
        type: "object",
        required: ["employer", "job_title", "setting", "started_on", "ended_on", "is_current", "description"],
        properties: {
          employer: { type: "string" },
          job_title: { type: "string" },
          setting: { type: ["string", "null"], description: "e.g. 'Nursing home', 'Hospital ward' — only if inferable." },
          started_on: { type: ["string", "null"], description: "YYYY-MM-DD. Use the 1st of the month if only month/year is given. Null if unknown." },
          ended_on: { type: ["string", "null"], description: "YYYY-MM-DD, or null if this is their current role or the end date isn't stated." },
          is_current: { type: "boolean" },
          description: { type: ["string", "null"] },
        },
      },
    },
    qualifications: {
      type: "array",
      items: {
        type: "object",
        required: ["type_id", "title", "awarding_body", "awarded_on"],
        properties: {
          type_id: { type: ["string", "null"] },
          title: { type: "string" },
          awarding_body: { type: ["string", "null"] },
          awarded_on: { type: ["string", "null"], description: "YYYY-MM-DD, null if unknown." },
        },
      },
    },
    registration: {
      type: ["object", "null"],
      description: "Only if the CV explicitly states a professional registration number (e.g. NMC PIN, HCPC number). Null otherwise — never guess a number.",
      required: ["regulator", "reg_number", "register_name"],
      properties: {
        regulator: { type: "string", enum: REGULATORS as unknown as string[] },
        reg_number: { type: "string" },
        register_name: { type: ["string", "null"] },
      },
    },
    sensitive_categories_noticed: {
      type: "array",
      items: { type: "string", enum: SENSITIVE_CATEGORIES as unknown as string[] },
      description: "Which of these categories appear ANYWHERE on the CV — list the category only, never the actual value, and never let a spotted value influence any other field above.",
    },
    overall_confidence: { type: "string", enum: CONFIDENCE_LEVELS as unknown as string[] },
  },
};

candidates.post("/me/cv", async (c) => {
  const contentType = c.req.header("Content-Type");
  if (contentType !== "application/pdf") {
    return c.json({ error: "Content-Type must be application/pdf — CVs must be uploaded as a PDF" }, 400);
  }

  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) return c.json({ error: "Empty file" }, 400);
  if (body.byteLength > 8 * 1024 * 1024) return c.json({ error: "File too large — 8MB maximum" }, 400);

  const userId = c.get("userId");
  const supabase = c.get("supabase");
  const originalName = c.req.header("X-File-Name") || null;

  const { data: importRow, error: insertError } = await supabase
    .from("cv_imports")
    .insert({
      candidate_id: userId,
      storage_path: "",
      original_name: originalName,
      mime_type: "application/pdf",
      byte_size: body.byteLength,
      status: "parsing",
    })
    .select()
    .single();
  if (insertError) return c.json({ error: insertError.message }, 400);

  const key = `candidates/${userId}/cv/${importRow.id}.pdf`;
  await c.env.MEDIA.put(key, body, { httpMetadata: { contentType: "application/pdf" } });
  await supabase.from("cv_imports").update({ storage_path: key }).eq("id", importRow.id);

  try {
    const conversion = await c.env.AI.toMarkdown(
      { name: originalName || "cv.pdf", blob: new Blob([body], { type: "application/pdf" }) },
      { conversionOptions: { pdf: { images: { convert: false } } } },
    );

    if (conversion.format === "error" || !conversion.data || !conversion.data.trim()) {
      const detail = conversion.format === "error" ? conversion.error : "No extractable text found — this may be a scanned/image-only PDF";
      await supabase.from("cv_imports").update({ status: "unreadable", error_detail: detail }).eq("id", importRow.id);
      return c.json({ cv_import: { ...importRow, status: "unreadable", error_detail: detail } });
    }

    const [professionsResult, skillsResult, qualTypesResult] = await Promise.all([
      supabase.from("professions").select("id, name"),
      supabase.from("clinical_skills").select("id, label"),
      supabase.from("qualification_types").select("id, label"),
    ]);
    const professionIds = new Set((professionsResult.data || []).map((p) => p.id));
    const skillIds = new Set((skillsResult.data || []).map((s) => s.id));
    const qualTypeIds = new Set((qualTypesResult.data || []).map((q) => q.id));

    const professionCatalogue = (professionsResult.data || []).map((p) => `${p.id}: ${p.name}`).join("\n");
    const skillCatalogue = (skillsResult.data || []).map((s) => `${s.id}: ${s.label}`).join("\n");
    const qualTypeCatalogue = (qualTypesResult.data || []).map((q) => `${q.id}: ${q.label}`).join("\n");

    const systemPrompt =
      "You extract structured data from a healthcare/social-care candidate's CV for a draft the candidate will review and edit themselves before anything is saved — never treat this as final. " +
      "Extract only what the document actually states; leave a field null or an array empty rather than guessing or inferring beyond what's written. " +
      "Never fill in, estimate, or infer: date of birth, nationality, immigration/visa status, marital status, gender, religion, ethnicity, health information, National Insurance number, or a photo — if any of these appear on the CV, add the matching category to sensitive_categories_noticed and do not transcribe the value anywhere in your output, including inside free-text fields like about or description. " +
      "Only use ids from the allowed lists below for profession_ids, skill_ids, and qualification type_id — never invent one. Respond with only the JSON object, no other text.\n\n" +
      "Allowed professions (id: name):\n" + professionCatalogue + "\n\n" +
      "Allowed clinical skills (id: label):\n" + skillCatalogue + "\n\n" +
      "Allowed qualification types (id: label):\n" + qualTypeCatalogue;

    const result = await c.env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Extract this CV into structured data:\n\n" + conversion.data },
      ],
      response_format: { type: "json_schema", json_schema: CV_EXTRACT_SCHEMA },
      max_tokens: 3000,
    });

    const rawResponse = typeof result === "object" && result !== null && "response" in result ? (result as { response?: string }).response : undefined;
    if (!rawResponse) {
      await supabase.from("cv_imports").update({ status: "unreadable", error_detail: "Model did not return structured data" }).eq("id", importRow.id);
      return c.json({ cv_import: { ...importRow, status: "unreadable" } });
    }

    let rawParsed: Record<string, unknown>;
    try {
      rawParsed = JSON.parse(rawResponse) as Record<string, unknown>;
    } catch {
      await supabase.from("cv_imports").update({ status: "unreadable", error_detail: "Model response wasn't valid JSON" }).eq("id", importRow.id);
      return c.json({ cv_import: { ...importRow, status: "unreadable" } });
    }

    const parsed = sanitizeParsed(rawParsed, professionIds, skillIds, qualTypeIds);

    const { data: updated, error: updateError } = await supabase
      .from("cv_imports")
      .update({
        status: "parsed",
        parsed,
        confidence: { overall: parsed.overall_confidence },
        sensitive_found: parsed.sensitive_categories_noticed,
        parsed_at: new Date().toISOString(),
      })
      .eq("id", importRow.id)
      .select()
      .single();
    if (updateError) return c.json({ error: updateError.message }, 400);

    return c.json({ cv_import: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "CV parsing failed";
    await supabase.from("cv_imports").update({ status: "failed", error_detail: message }).eq("id", importRow.id);
    return c.json({ cv_import: { ...importRow, status: "failed", error_detail: message } });
  }
});

candidates.get("/me/cv/latest", async (c) => {
  const { data, error } = await c
    .get("supabase")
    .from("cv_imports")
    .select("*")
    .eq("candidate_id", c.get("userId"))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ cv_import: data });
});

candidates.post("/me/cv/:id/mark-applied", async (c) => {
  const { data, error } = await c
    .get("supabase")
    .from("cv_imports")
    .update({ status: "review_complete", applied_at: new Date().toISOString() })
    .eq("id", c.req.param("id"))
    .eq("candidate_id", c.get("userId"))
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ cv_import: data });
});

export default candidates;
