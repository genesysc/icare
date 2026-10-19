import { Hono } from "hono";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "./middleware";
import { BLOG_POSTS } from "./blog-content";

// Honest community activity — migration 0059, HANDOVER.md §28. Agreed
// with the founder (2026-10-19) instead of fake accounts: everything here
// shows something real.
//
//   GET  /community/stats           real counts (public — used by the
//                                   landing page too; aggregates only)
//   GET  /community/team-posts      "iCare Team" posts (signed in)
//   GET  /community/invite          my invite code + how many joined
//   POST /community/invite/claim    new member's browser claims a code
//   GET  /community/welcome         should I be asked to be announced?
//   POST /community/welcome         { announce: true|false }
//   GET  /community/new-members     opted-in members, last 14 days
//                                   (candidates only, enforced in the DB)

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
};

type Variables = {
  supabase: SupabaseClient;
  userId: string;
};

const community = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Public, before requireAuth. Counts only — nothing about any person.
community.get("/stats", async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.rpc("community_stats");
  if (error) return c.json({ error: error.message }, 500);
  const now = Date.now();
  const articlesThisWeek = BLOG_POSTS.filter((p) => now - Date.parse(p.datePublished) < WEEK_MS).length;
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ ...(data as Record<string, unknown>), articles_this_week: articlesThisWeek });
});

community.use("*", requireAuth);

community.get("/team-posts", async (c) => {
  const { data, error } = await c
    .get("supabase")
    .from("team_posts")
    .select("id, title, body, link_url, link_label, pinned_until, published_at")
    .order("published_at", { ascending: false })
    .limit(10);
  if (error) return c.json({ error: error.message }, 500);
  // Pinned (still within pinned_until) first, then newest — recency and
  // pinning only, never personalised (HANDOVER §1 #5).
  const now = Date.now();
  const posts = (data || []).sort((a, b) => {
    const ap = a.pinned_until && Date.parse(a.pinned_until) > now ? 1 : 0;
    const bp = b.pinned_until && Date.parse(b.pinned_until) > now ? 1 : 0;
    return bp - ap || Date.parse(b.published_at) - Date.parse(a.published_at);
  });
  return c.json({ posts: posts.slice(0, 3) });
});

community.get("/invite", async (c) => {
  const { data, error } = await c.get("supabase").rpc("my_invite");
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

community.post("/invite/claim", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim().slice(0, 32) : "";
  if (!/^[a-z0-9]{6,16}$/i.test(code)) return c.json({ claimed: false });
  const { data, error } = await c.get("supabase").rpc("claim_invite", { p_code: code });
  if (error) return c.json({ claimed: false });
  return c.json({ claimed: !!data });
});

community.get("/welcome", async (c) => {
  const { data, error } = await c.get("supabase").rpc("my_welcome_status");
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data || { eligible: false, choice: null });
});

community.post("/welcome", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.announce !== "boolean") return c.json({ error: "announce must be true or false" }, 400);
  const { error } = await c.get("supabase").rpc("set_welcome_choice", { p_announce: body.announce });
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});

community.get("/new-members", async (c) => {
  const { data, error } = await c.get("supabase").rpc("recent_member_welcomes");
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ members: data || [] });
});

export default community;
