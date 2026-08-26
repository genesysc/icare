import { Hono } from "hono";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "./middleware";

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  MEDIA: R2Bucket;
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
  const { data, error } = await c.get("supabase").rpc("publish_my_profile");
  if (error) return c.json({ error: error.message }, 400);
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

export default candidates;
