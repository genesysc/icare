import { Hono } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
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

const rounds = new Hono<{ Bindings: Bindings; Variables: Variables }>();
rounds.use("*", requireAuth);

// Media attached to any post this candidate can see — looks the path up via
// candidate_peer_feed (already the single source of truth for "can I see
// this post") rather than candidate_posts directly, since the RLS policy on
// that table only lets a candidate read their OWN rows; this feed view is
// the query surface for everyone else's, matching this codebase's
// established view-bypasses-RLS pattern (see candidate_search).
rounds.get("/media/:postId", async (c) => {
  const postId = Number(c.req.param("postId"));
  const supabase = c.get("supabase");
  const userId = c.get("userId");

  let mediaPath: string | null = null;
  const { data: feedPost } = await supabase.from("candidate_peer_feed").select("media_path").eq("id", postId).maybeSingle();
  mediaPath = feedPost?.media_path ?? null;
  if (!mediaPath) {
    const { data: ownPost } = await supabase
      .from("candidate_posts")
      .select("media_path")
      .eq("id", postId)
      .eq("candidate_id", userId)
      .maybeSingle();
    mediaPath = ownPost?.media_path ?? null;
  }
  if (!mediaPath) return c.json({ error: "Not found" }, 404);

  const object = await c.env.MEDIA.get(mediaPath);
  if (!object) return c.json({ error: "Not found" }, 404);

  return new Response(object.body, {
    headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream" },
  });
});

// The feed — candidate_peer_feed (0026, extended 0037) already encodes the
// entire visibility rule (published, not flagged, public or accepted
// connection), so this is a straight read with no app-layer filtering.
rounds.get("/feed", async (c) => {
  const before = c.req.query("before");
  let query = c
    .get("supabase")
    .from("candidate_peer_feed")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);
  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ posts: data });
});

rounds.post("/posts/:id/reaction", async (c) => {
  const { data, error } = await c.get("supabase").rpc("toggle_post_reaction", { p_post_id: Number(c.req.param("id")) });
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ reacted: data });
});

rounds.get("/posts/:id/comments", async (c) => {
  const { data, error } = await c
    .get("supabase")
    .from("post_comments_feed")
    .select("*")
    .eq("post_id", c.req.param("id"))
    .order("created_at", { ascending: true });

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ comments: data });
});

rounds.post("/posts/:id/comments", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) return c.json({ error: "body is required" }, 400);

  const { data, error } = await c
    .get("supabase")
    .rpc("add_post_comment", { p_post_id: Number(c.req.param("id")), p_body: text });
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ comment_id: data }, 201);
});

rounds.delete("/comments/:id", async (c) => {
  const { error } = await c
    .get("supabase")
    .from("post_comments")
    .delete()
    .eq("id", c.req.param("id"))
    .eq("candidate_id", c.get("userId"));

  if (error) return c.json({ error: error.message }, 400);
  return c.body(null, 204);
});

rounds.get("/posts/:id/mentions", async (c) => {
  const { data, error } = await c
    .get("supabase")
    .from("post_mentions_feed")
    .select("*")
    .eq("post_id", c.req.param("id"));

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ mentions: data });
});

// @Mention search while composing — platform-wide (build spec §2), so this
// deliberately does NOT exclude non-connections the way /network/discover
// does. Still gated to signed-in candidates only (requireAuth above).
rounds.get("/mention-search", async (c) => {
  const q = (c.req.query("q") || "").trim();
  if (q.length < 2) return c.json({ candidates: [] });

  const { data, error } = await c
    .get("supabase")
    .from("candidate_mention_search")
    .select("*")
    .ilike("full_name", `%${q}%`)
    .neq("id", c.get("userId"))
    .limit(8);

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ candidates: data });
});

// --- Check-in venue lookup --------------------------------------------
// Scoped, not open geolocation (build spec §2): the client sends a
// free-text query plus an optional GPS-derived viewbox to narrow results,
// and the response is only ever a list of NAMED places — the raw
// coordinates the browser captured to build that viewbox never leave the
// browser or get stored anywhere (nothing here persists lat/lon; only a
// candidate's own final venue-name pick, via /candidates/me/posts, is ever
// saved). Employer venues from this platform's own directory are offered
// first; OpenStreetMap Nominatim only fills in venues that aren't already
// one of our employers (training centres, conference venues, etc.).
rounds.get("/checkin/venues", async (c) => {
  const q = (c.req.query("q") || "").trim();
  if (!q || q.length < 2) return c.json({ employers: [], places: [] });

  const supabase = c.get("supabase");
  const { data: employerMatches } = await supabase
    .from("employers")
    .select("id, org_name")
    .ilike("org_name", `%${q}%`)
    .eq("is_verified", true)
    .limit(8);

  const viewbox = c.req.query("viewbox"); // "minLon,maxLat,maxLon,minLat" — optional GPS-derived bounding box
  const params = new URLSearchParams({ q, format: "jsonv2", limit: "8", addressdetails: "0" });
  if (viewbox && /^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(viewbox)) {
    params.set("viewbox", viewbox);
    params.set("bounded", "1");
  }

  let places: { name: string }[] = [];
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { "User-Agent": "iCare-app/1.0 (info@icareltd.com)" },
    });
    if (res.ok) {
      const results = await res.json<{ display_name: string; name?: string }[]>();
      places = results.map((r) => ({ name: r.name || r.display_name.split(",")[0] }));
    }
  } catch {
    // Nominatim hiccup — employer matches still work, just no external suggestions.
  }

  return c.json({
    employers: (employerMatches || []).map((e) => ({ id: e.id, name: e.org_name })),
    places,
  });
});

export default rounds;
