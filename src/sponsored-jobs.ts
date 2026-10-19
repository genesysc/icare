import { Hono } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "./middleware";

// UK sponsored jobs board — migration 0056, HANDOVER.md §27. Read-only
// list/detail over `sponsored_jobs` plus on-site apply for jobs with
// apply_mode 'direct'.
//
// Unlike Sponsor check and News, this IS gated on a finished profile
// (founder, 2026-10-19: "only accessible once someone has created a
// profile"). RLS (sponsored_jobs_member_read: candidate + onboarding_done
// + open + exact register match) is the real gate; the explicit check
// below just lets the page tell "finish your profile" apart from "no jobs".

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
};

type Variables = {
  supabase: SupabaseClient;
  userId: string;
};

const sponsoredJobs = new Hono<{ Bindings: Bindings; Variables: Variables }>();

sponsoredJobs.use("*", requireAuth);

const PAGE_SIZE = 20;

const LIST_COLUMNS =
  "id, source, title, employer_name, town, region, salary_min, salary_max, salary_period, sector, contract_type, hours, care_switchers_only, apply_mode, posted_at, expires_at, badge_register, badge_role, badge_employer_confirmed, register_date, checked_at";

const DETAIL_COLUMNS = `${LIST_COLUMNS}, soc_code, apply_url, description`;

async function hasAccess(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("candidate_onboarding_done");
  if (error) return false;
  const { data: me } = await supabase.rpc("current_role_is", { p_role: "candidate" });
  return data === true && me === true;
}

// Who can see the board, plus the region list for the filter. Always 200
// so the page can render its locked state from `access: false`.
sponsoredJobs.get("/status", async (c) => {
  const supabase = c.get("supabase");
  if (!(await hasAccess(supabase))) return c.json({ access: false });
  const { data, error } = await supabase.from("sponsored_jobs").select("region");
  if (error) return c.json({ error: error.message }, 500);
  const regions = [...new Set((data || []).map((r) => r.region).filter(Boolean))].sort();
  return c.json({ access: true, total: (data || []).length, regions });
});

sponsoredJobs.get("/", async (c) => {
  const supabase = c.get("supabase");
  if (!(await hasAccess(supabase))) return c.json({ error: "Finish your profile to see the jobs board", code: "profile_required" }, 403);

  // Strip PostgREST filter syntax and LIKE wildcards before building the
  // or() filter — the query string is user input.
  const q = (c.req.query("q") || "").replace(/[,()*%_\\:."]/g, " ").trim().slice(0, 100);
  const region = (c.req.query("region") || "").trim().slice(0, 100);
  const page = Math.max(0, Math.min(500, parseInt(c.req.query("page") || "0", 10) || 0));

  let query = supabase
    .from("sponsored_jobs")
    .select(LIST_COLUMNS, { count: "exact" })
    .order("posted_at", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  if (q) query = query.or(`title.ilike.*${q}*,employer_name.ilike.*${q}*,town.ilike.*${q}*`);
  if (region) query = query.eq("region", region);

  const { data, error, count } = await query;
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ jobs: data || [], total: count || 0, page, page_size: PAGE_SIZE });
});

// The caller's own applications (job ids + status) so the page can show
// "Applied" on jobs already applied for.
sponsoredJobs.get("/me/applications", async (c) => {
  const supabase = c.get("supabase");
  const { data, error } = await supabase
    .from("sponsored_job_applications")
    .select("job_id, status, created_at")
    .order("created_at", { ascending: false });
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ applications: data || [] });
});

sponsoredJobs.get("/:id", async (c) => {
  const supabase = c.get("supabase");
  if (!(await hasAccess(supabase))) return c.json({ error: "Finish your profile to see the jobs board", code: "profile_required" }, 403);
  const id = c.req.param("id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: "Not found" }, 404);
  const { data, error } = await supabase.from("sponsored_jobs").select(DETAIL_COLUMNS).eq("id", id).maybeSingle();
  if (error) return c.json({ error: error.message }, 500);
  if (!data) return c.json({ error: "This job is no longer listed" }, 404);
  return c.json({ job: data });
});

sponsoredJobs.post("/:id/apply", async (c) => {
  const supabase = c.get("supabase");
  const id = c.req.param("id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json().catch(() => ({}));
  const note = typeof body.note === "string" ? body.note.slice(0, 1000) : null;
  const { data, error } = await supabase.rpc("apply_to_sponsored_job", { p_job_id: id, p_note: note });
  if (error) {
    if (error.code === "42501") return c.json({ error: error.message, code: "profile_required" }, 403);
    if (error.code === "P0002") return c.json({ error: error.message }, 409);
    return c.json({ error: error.message }, 500);
  }
  return c.json({ application: { job_id: data.job_id, status: data.status, created_at: data.created_at } });
});

export default sponsoredJobs;
