import { Hono } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "./middleware";

// Sponsor licence check — migration 0052, HANDOVER.md §25. Read-only
// search over the Home Office register of A-rated Skilled Worker
// sponsors, refreshed daily by scripts/refresh-sponsor-register.js.
//
// Signed-in only (founder decision, 2026-10-14), but deliberately NOT
// gated on onboarding or on role — someone who signed up from the launch
// email can use this straight away. RLS on `sponsors` (authenticated,
// active rows) is the real gate; this file just shapes the response.

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
};

type Variables = {
  supabase: SupabaseClient;
  userId: string;
};

const sponsors = new Hono<{ Bindings: Bindings; Variables: Variables }>();

sponsors.use("*", requireAuth);

const PAGE_SIZE = 50;

// Latest successfully applied register — the "Checked against the
// register on [date]" stamp the page shows.
sponsors.get("/status", async (c) => {
  const supabase = c.get("supabase");
  const { data, error } = await supabase
    .from("register_runs")
    .select("register_date, row_count, run_at")
    .eq("status", "complete")
    .order("register_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ register: data });
});

sponsors.get("/search", async (c) => {
  const name = (c.req.query("name") || "").trim().slice(0, 200);
  const town = (c.req.query("town") || "").trim().slice(0, 100);
  const page = Math.max(0, Math.min(200, parseInt(c.req.query("page") || "0", 10) || 0));
  if (name.length < 2) return c.json({ results: [], total: 0, page, page_size: PAGE_SIZE });

  const supabase = c.get("supabase");
  const { data, error } = await supabase.rpc("search_sponsors", {
    p_name: name,
    p_town: town || null,
    p_limit: PAGE_SIZE,
    p_offset: page * PAGE_SIZE,
  });
  if (error) return c.json({ error: error.message }, 500);

  const rows = (data || []) as Array<{
    id: string;
    name: string;
    town: string;
    county: string | null;
    rating: string;
    first_seen_date: string;
    match: string;
    total: number;
  }>;
  return c.json({
    results: rows.map(({ total: _total, ...r }) => r),
    total: rows.length ? Number(rows[0].total) : 0,
    page,
    page_size: PAGE_SIZE,
  });
});

export default sponsors;
