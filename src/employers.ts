import { Hono } from "hono";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { requireAuth } from "./middleware";

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
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

employers.get("/me", async (c) => {
  const supabase = c.get("supabase");
  const userId = c.get("userId");

  const [employerResult, requestsResult] = await Promise.all([
    supabase.from("employers").select("id, org_name, cqc_provider_id, is_verified, created_at").eq("id", userId).single(),
    supabase
      .from("employer_verification_requests")
      .select("id, submitted_org_name, submitted_email, cqc_provider_id, companies_house_no, status, reviewer_note, reviewed_at, created_at")
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

// Submits (or re-submits) for verification review. Requires at least one
// identifier. submitted_org_name/submitted_email are stamped server-side
// from the employer's own current record — never trusted from the
// client — same philosophy as the DBS route's server-stamped
// consent_given_at.
employers.post("/me/verification-requests", async (c) => {
  const body = await c.req.json();
  const cqcProviderId = typeof body.cqc_provider_id === "string" ? body.cqc_provider_id.trim() : "";
  const companiesHouseNo = typeof body.companies_house_no === "string" ? body.companies_house_no.trim() : "";

  if (!cqcProviderId && !companiesHouseNo) {
    return c.json({ error: "Provide a CQC provider ID or Companies House number" }, 400);
  }

  const supabase = c.get("supabase");
  const userId = c.get("userId");

  if (cqcProviderId) {
    const { error: updateError } = await supabase.from("employers").update({ cqc_provider_id: cqcProviderId }).eq("id", userId);
    if (updateError) return c.json({ error: updateError.message }, 400);
  }

  const [employerResult, accountResult] = await Promise.all([
    supabase.from("employers").select("org_name").eq("id", userId).single(),
    supabase.from("accounts").select("email").eq("id", userId).single(),
  ]);
  if (employerResult.error) return c.json({ error: employerResult.error.message }, 400);
  if (accountResult.error) return c.json({ error: accountResult.error.message }, 400);

  const { data, error } = await supabase
    .from("employer_verification_requests")
    .insert({
      employer_id: userId,
      submitted_org_name: employerResult.data.org_name,
      submitted_email: accountResult.data.email,
      cqc_provider_id: cqcProviderId || null,
      companies_house_no: companiesHouseNo || null,
    })
    .select("id, submitted_org_name, submitted_email, cqc_provider_id, companies_house_no, status, reviewer_note, reviewed_at, created_at")
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ verification_request: data });
});

export default employers;
