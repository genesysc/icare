import { Hono } from "hono";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { requireAuth } from "./middleware";
import { sendTransactionalEmail } from "./email";
import { employerVerificationSubmittedEmail } from "./emails/employer-verification-submitted";

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SENDER_API_KEY?: string;
  SENDER_FROM_EMAIL?: string;
  MEDIA: R2Bucket;
};

type Variables = {
  supabase: SupabaseClient;
  userId: string;
  user: User;
};

const employers = new Hono<{ Bindings: Bindings; Variables: Variables }>();
employers.use("*", requireAuth);

// SPRINTS.md Sprint 7 — employer verification flow.
//
// employers.is_verified is the actual gate (checked by the existing
// is_verified_employer() RPC) — it can only be flipped by service_role,
// enforced by a DB trigger (lock_employer_verification()), confirmed by
// reading its real SQL before building this. This app layer never sends
// is_verified in any update payload, belt-and-braces with that trigger.
//
// employer_verification_requests is an append-only audit trail (RLS:
// INSERT + SELECT only for the employer, no UPDATE policy exists) — each
// submission is a new row, not an edit of a previous one. Review itself
// stays manual (Supabase dashboard) for now, same as Sprint 3's
// qualifications/registrations — no admin UI in this sprint.
//
// Founder decision, 2026-08-26 (superseding the original CQC-only design):
// not every UK care employer is CQC-registered — Scotland has its own Care
// Inspectorate, Northern Ireland has RQIA, Wales has CIW — and the founder
// explicitly deprioritised region-specific agency-licensing checks. The
// real minimum bar is a Companies House number (proof of being a genuine
// UK-registered company), which is now REQUIRED to submit for verification.
// A care-regulator registration (regulator + regulator_reg_number) is
// OPTIONAL supplementary evidence, collected only when the employer
// actually has one — required together if either is given, never required
// on its own.

const CARE_REGULATORS = ["cqc", "care_inspectorate_scotland", "rqia", "ciw"] as const;
const CARE_REGULATOR_LABELS: Record<string, string> = {
  cqc: "CQC (England)",
  care_inspectorate_scotland: "Care Inspectorate (Scotland)",
  rqia: "RQIA (Northern Ireland)",
  ciw: "CIW (Wales)",
};

employers.get("/me", async (c) => {
  const supabase = c.get("supabase");
  const userId = c.get("userId");

  const [employerResult, requestsResult] = await Promise.all([
    supabase.from("employers").select("id, org_name, companies_house_no, regulator, regulator_reg_number, is_verified, created_at").eq("id", userId).single(),
    supabase
      .from("employer_verification_requests")
      .select("id, submitted_org_name, submitted_email, companies_house_no, regulator, regulator_reg_number, status, reviewer_note, reviewed_at, created_at")
      .eq("employer_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  if (employerResult.error) return c.json({ error: employerResult.error.message }, 400);
  if (requestsResult.error) return c.json({ error: requestsResult.error.message }, 400);

  return c.json({
    employer: employerResult.data,
    verification_requests: requestsResult.data,
    latest_verification_request: requestsResult.data[0] || null,
  });
});

// Submits (or re-submits) for verification review. Companies House number is
// required; regulator + regulator_reg_number are optional but must be given
// together. submitted_org_name/submitted_email are stamped server-side from
// the employer's own current record — never trusted from the client — same
// philosophy as the DBS route's server-stamped consent_given_at.
employers.post("/me/verification-requests", async (c) => {
  const body = await c.req.json();
  const companiesHouseNo = typeof body.companies_house_no === "string" ? body.companies_house_no.trim() : "";
  const regulator = typeof body.regulator === "string" ? body.regulator.trim() : "";
  const regulatorRegNumber = typeof body.regulator_reg_number === "string" ? body.regulator_reg_number.trim() : "";

  if (!companiesHouseNo) {
    return c.json({ error: "Companies House number is required" }, 400);
  }
  if (regulator && !(CARE_REGULATORS as readonly string[]).includes(regulator)) {
    return c.json({ error: "Unrecognised care regulator" }, 400);
  }
  if ((regulator && !regulatorRegNumber) || (!regulator && regulatorRegNumber)) {
    return c.json({ error: "Provide both a care regulator and a registration number, or leave both blank" }, 400);
  }

  const supabase = c.get("supabase");
  const userId = c.get("userId");

  const employerUpdate: Record<string, string | null> = { companies_house_no: companiesHouseNo };
  if (regulator) {
    employerUpdate.regulator = regulator;
    employerUpdate.regulator_reg_number = regulatorRegNumber;
  }
  const { error: updateError } = await supabase.from("employers").update(employerUpdate).eq("id", userId);
  if (updateError) return c.json({ error: updateError.message }, 400);

  const [employerResult, accountResult] = await Promise.all([
    supabase.from("employers").select("org_name").eq("id", userId).single(),
    supabase.from("accounts").select("full_name, email").eq("id", userId).single(),
  ]);
  if (employerResult.error) return c.json({ error: employerResult.error.message }, 400);
  if (accountResult.error) return c.json({ error: accountResult.error.message }, 400);

  const { data, error } = await supabase
    .from("employer_verification_requests")
    .insert({
      employer_id: userId,
      submitted_org_name: employerResult.data.org_name,
      submitted_email: accountResult.data.email,
      companies_house_no: companiesHouseNo,
      regulator: regulator || null,
      regulator_reg_number: regulatorRegNumber || null,
    })
    .select("id, submitted_org_name, submitted_email, companies_house_no, regulator, regulator_reg_number, status, reviewer_note, reviewed_at, created_at")
    .single();

  if (error) return c.json({ error: error.message }, 400);

  const { subject, html } = employerVerificationSubmittedEmail({
    fullName: accountResult.data.full_name,
    orgName: employerResult.data.org_name,
    companiesHouseNo,
    regulatorLabel: regulator ? CARE_REGULATOR_LABELS[regulator] : null,
    homeUrl: new URL(c.req.url).origin + "/employer/home",
  });
  await sendTransactionalEmail(c.env, accountResult.data.email, subject, html);

  return c.json({ verification_request: data });
});

// --- Photo/video/CV — Sprint 9 remainder, consent-gated ---
// R2 has no RLS of its own, so the explicit shortlistConsented() check
// below is the actual gate for photo/video; CV additionally goes through
// cv_imports' existing cv_read_shortlisted RLS policy (0004_cv_import) as
// a second, independent check on the same condition — belt and braces,
// not redundancy for its own sake, since a Worker route bug in the
// explicit check wouldn't be caught by anything else for photo/video.
// Sprint 15: fixed a real bug introduced by Sprint 14 — once a candidate
// could hold more than one pipeline with the same employer (one per job),
// .maybeSingle() here would throw (PGRST116, "multiple rows returned")
// the moment a candidate had two shortlist rows with this employer, even
// if only one was consented. Media access isn't job-specific (a photo/
// video/CV is the same file regardless of which role it's for), so this
// checks for ANY currently open, consented pipeline with this employer —
// not a specific one — per HANDOVER.md §14's "is there a currently-active
// pipeline" access-check standard (not "was ever granted").
async function shortlistConsented(supabase: SupabaseClient, employerId: string, candidateId: string): Promise<boolean> {
  const { data } = await supabase
    .from("shortlists")
    .select("candidate_consented_at")
    .eq("employer_id", employerId)
    .eq("candidate_id", candidateId)
    .not("candidate_consented_at", "is", null)
    .is("closed_at", null)
    .limit(1);
  return !!data?.length;
}

employers.get("/candidates/:id/photo", async (c) => {
  const consented = await shortlistConsented(c.get("supabase"), c.get("userId"), c.req.param("id"));
  if (!consented) return c.json({ error: "Not consented to view this candidate's photo" }, 403);

  const object = await c.env.MEDIA.get(`candidates/${c.req.param("id")}/photo`);
  if (!object) return c.json({ error: "No photo uploaded" }, 404);
  return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream" } });
});

employers.get("/candidates/:id/video", async (c) => {
  const consented = await shortlistConsented(c.get("supabase"), c.get("userId"), c.req.param("id"));
  if (!consented) return c.json({ error: "Not consented to view this candidate's video" }, 403);

  const object = await c.env.MEDIA.get(`candidates/${c.req.param("id")}/video`);
  if (!object) return c.json({ error: "No video uploaded" }, 404);
  return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream" } });
});

employers.get("/candidates/:id/cv", async (c) => {
  const supabase = c.get("supabase");
  const candidateId = c.req.param("id");
  const consented = await shortlistConsented(supabase, c.get("userId"), candidateId);
  if (!consented) return c.json({ error: "Not consented to view this candidate's CV" }, 403);

  const { data: cv, error } = await supabase
    .from("cv_imports")
    .select("storage_path, mime_type")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return c.json({ error: error.message }, 400);
  if (!cv?.storage_path) return c.json({ error: "No CV on file" }, 404);

  const object = await c.env.MEDIA.get(cv.storage_path);
  if (!object) return c.json({ error: "CV file not found" }, 404);
  return new Response(object.body, { headers: { "Content-Type": cv.mime_type || "application/pdf" } });
});

// --- Pipeline (iRecruit) read view — Sprint 9 (partial) ---
// Chat is the primary interface for shortlisting/moving stages (see
// employer-chat.ts); this is a read-only supporting view so the employer
// can actually see the pipeline the chat commands are building, not just
// talk to it. candidate_search is reused for display fields rather than a
// new view — same fields already shown pre-shortlist per non-negotiable #4.
employers.get("/pipeline", async (c) => {
  const supabase = c.get("supabase");
  const userId = c.get("userId");

  const { data: shortlistRows, error } = await supabase
    .from("shortlists")
    .select("id, candidate_id, job_id, job_snapshot, stage, created_at, stage_updated_at, candidate_consented_at, closed_at")
    .eq("employer_id", userId)
    .order("stage_updated_at", { ascending: false });
  if (error) return c.json({ error: error.message }, 400);

  const candidateIds = (shortlistRows || []).map((r) => r.candidate_id);
  const candidatesById: Record<string, unknown> = {};
  if (candidateIds.length) {
    const { data: candidateRows, error: candidatesError } = await supabase
      .from("candidate_search")
      .select("id, full_name, primary_profession, current_job_title, current_employer, town, postcode_district")
      .in("id", candidateIds);
    if (candidatesError) return c.json({ error: candidatesError.message }, 400);
    for (const cand of candidateRows || []) candidatesById[cand.id] = cand;
  }

  const pipeline = (shortlistRows || []).map((r) => ({
    id: r.id,
    candidate_id: r.candidate_id,
    job_id: r.job_id,
    job_title: (r.job_snapshot as { title?: string } | null)?.title || null,
    stage: r.stage,
    created_at: r.created_at,
    stage_updated_at: r.stage_updated_at,
    consented: !!r.candidate_consented_at,
    closed: !!r.closed_at,
    candidate: candidatesById[r.candidate_id as string] || null,
  }));

  return c.json({ pipeline });
});

// --- Bookmarks (Sprint 14) — read-only supporting view for the same reason
// /pipeline exists: bookmark_candidates in employer-chat.ts is the primary
// interface, this just lets the employer see what chat has built. Genuinely
// private — no candidate-facing equivalent exists anywhere, and none should.
employers.get("/bookmarks", async (c) => {
  const supabase = c.get("supabase");
  const userId = c.get("userId");

  const { data: bookmarkRows, error } = await supabase
    .from("bookmarks")
    .select("candidate_id, created_at")
    .eq("employer_id", userId)
    .order("created_at", { ascending: false });
  if (error) return c.json({ error: error.message }, 400);

  const candidateIds = (bookmarkRows || []).map((r) => r.candidate_id);
  const candidatesById: Record<string, unknown> = {};
  if (candidateIds.length) {
    const { data: candidateRows, error: candidatesError } = await supabase
      .from("candidate_search")
      .select("id, full_name, primary_profession, current_job_title, town, postcode_district")
      .in("id", candidateIds);
    if (candidatesError) return c.json({ error: candidatesError.message }, 400);
    for (const cand of candidateRows || []) candidatesById[cand.id] = cand;
  }

  const bookmarks = (bookmarkRows || []).map((r) => ({
    candidate_id: r.candidate_id,
    created_at: r.created_at,
    candidate: candidatesById[r.candidate_id as string] || null,
  }));

  return c.json({ bookmarks });
});

employers.delete("/bookmarks/:candidateId", async (c) => {
  const { error } = await c
    .get("supabase")
    .from("bookmarks")
    .delete()
    .eq("employer_id", c.get("userId"))
    .eq("candidate_id", c.req.param("candidateId"));
  if (error) return c.json({ error: error.message }, 400);
  return c.body(null, 204);
});

// --- Report a candidate post (Sprint 8 follow-up: candidate posts) ---
// Posts have no pre-publish review by design — this is the only moderation
// hook. flag_candidate_post() is security definer (checks is_verified_employer()
// itself, sets is_flagged), so this route is a thin pass-through; the RPC is
// the actual authority.
employers.post("/posts/:id/report", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  const postId = Number(c.req.param("id"));
  if (!Number.isInteger(postId)) return c.json({ error: "invalid post id" }, 400);

  const { error } = await c.get("supabase").rpc("flag_candidate_post", { p_post_id: postId, p_reason: reason || null });
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ reported: true });
});

export default employers;
