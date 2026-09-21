import { Hono } from "hono";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "./middleware";

// Candidate Home ("Rounds") news feed — migration 0048. See
// HANDOVER.md's news-feed section for the full design writeup. Reads go
// through the news_feed view (RLS-gated to current_role_is('candidate'),
// same as every other candidate-only surface in this schema) — this file
// never touches news_items directly, matching the "views do the
// aggregation" convention already established elsewhere (my_notifications,
// candidate_peer_feed).
//
// Ingestion (writing new items in) is a completely separate path — the
// Worker's scheduled() cron handler in index.ts, authenticated via a
// shared secret against the ingest_news_item()/prune_stale_news_items()
// RPCs, not through this Hono sub-app at all. Nothing here can write a
// news_items row.

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
};

type Variables = {
  supabase: SupabaseClient;
  userId: string;
};

const news = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Diagnostic route, not a candidate feature — deliberately registered
// before the requireAuth blanket below so it's reachable with no
// candidate session (the founder checking on a stalled cron has no
// reason to be signed in as a candidate). Authenticated instead via the
// same shared secret the cron job itself uses against
// news_ingest_status() — see migration 0051. Query param, not a header,
// since this is meant to be checked with a plain browser/curl request.
news.get("/ingest-status", async (c) => {
  const secret = c.req.query("secret");
  if (!secret) return c.json({ error: "missing secret" }, 401);

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.rpc("news_ingest_status", { p_secret: secret });
  if (error) return c.json({ error: "unauthorized" }, 401);
  return c.json(data);
});

news.use("*", requireAuth);

const VALID_CATEGORIES = ["adult-social-care", "nhs-policy", "global-health", "innovation"];

// Proposed default, not a client-confirmed number — the handover's own
// §8 asked engineering to suggest one rather than guess silently. 6 days:
// the midpoint of the client's own "not 24 hours, not stale either, ~5-7
// days" direction. See HANDOVER.md — open to being told a different
// number.
const ROLLING_WINDOW_DAYS = 6;

news.get("/", async (c) => {
  const supabase = c.get("supabase");
  const category = c.req.query("category");
  const limit = Math.min(Number(c.req.query("limit")) || 20, 50);
  const cursor = c.req.query("cursor"); // an ISO published_at from the last item of the previous page

  let query = supabase
    .from("news_feed")
    .select("*")
    .gte("published_at", new Date(Date.now() - ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString())
    .order("published_at", { ascending: false })
    .limit(limit);

  if (category) {
    if (!VALID_CATEGORIES.includes(category)) return c.json({ error: "invalid category" }, 400);
    query = query.eq("category", category);
  }
  if (cursor) query = query.lt("published_at", cursor);

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ items: data });
});

news.post("/:id/like", async (c) => {
  const { error } = await c
    .get("supabase")
    .from("news_item_likes")
    .insert({ news_item_id: c.req.param("id"), candidate_id: c.get("userId") });
  // Already-liked is not an error the caller needs to see — idempotent
  // like, same "toggle, don't fail on repeat" spirit as
  // toggle_post_reaction elsewhere in this app.
  if (error && error.code !== "23505") return c.json({ error: error.message }, 400);
  return c.body(null, 204);
});

news.delete("/:id/like", async (c) => {
  const { error } = await c
    .get("supabase")
    .from("news_item_likes")
    .delete()
    .eq("news_item_id", c.req.param("id"))
    .eq("candidate_id", c.get("userId"));
  if (error) return c.json({ error: error.message }, 400);
  return c.body(null, 204);
});

news.get("/:id/comments", async (c) => {
  const { data, error } = await c
    .get("supabase")
    .from("news_item_comments")
    .select("id, candidate_id, body, created_at, candidates(headline)")
    .eq("news_item_id", c.req.param("id"))
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ comments: data });
});

news.post("/:id/comments", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text || text.length > 1000) return c.json({ error: "body must be 1-1000 characters" }, 400);

  const { data, error } = await c
    .get("supabase")
    .from("news_item_comments")
    .insert({ news_item_id: c.req.param("id"), candidate_id: c.get("userId"), body: text })
    .select()
    .single();
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ comment: data }, 201);
});

news.delete("/:id/comments/:commentId", async (c) => {
  const { error } = await c
    .get("supabase")
    .from("news_item_comments")
    .delete()
    .eq("id", c.req.param("commentId"))
    .eq("candidate_id", c.get("userId"));
  if (error) return c.json({ error: error.message }, 400);
  return c.body(null, 204);
});

news.post("/:id/comments/:commentId/report", async (c) => {
  const { error } = await c.get("supabase").rpc("report_news_comment", { p_comment_id: c.req.param("commentId") });
  if (error) return c.json({ error: error.message }, 400);
  return c.body(null, 204);
});

export default news;
