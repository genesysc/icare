import { Hono } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuth } from "./middleware";

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
};

type Variables = {
  supabase: SupabaseClient;
  userId: string;
};

const network = new Hono<{ Bindings: Bindings; Variables: Variables }>();
network.use("*", requireAuth);

// "People you may know" — candidate_discover (0026, extended 0037) already
// excludes yourself and existing accepted connections, and carries
// connection_status so the client can render Connect vs. "Request sent"
// vs. Accept/Decline without a second round trip.
network.get("/discover", async (c) => {
  const { data, error } = await c.get("supabase").from("candidate_discover").select("*").limit(30);
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ candidates: data });
});

network.get("/connections", async (c) => {
  const { data, error } = await c.get("supabase").from("my_connections").select("*").order("connected_at", { ascending: false });
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ connections: data });
});

network.get("/requests", async (c) => {
  const { data, error } = await c.get("supabase").from("my_pending_requests").select("*").order("created_at", { ascending: false });
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ requests: data });
});

// Connect flow (build spec §3): the note is optional — don't require it,
// that would suppress low-friction connecting. The connections table's own
// RLS insert policy (0027) already enforces current-role and
// candidate_is_published(addressee_id); this route just shapes the payload.
network.post("/connect", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const addresseeId = typeof body?.candidate_id === "string" ? body.candidate_id : "";
  if (!addresseeId) return c.json({ error: "candidate_id is required" }, 400);
  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  const { data, error } = await c
    .get("supabase")
    .from("connections")
    .insert({ requester_id: c.get("userId"), addressee_id: addresseeId, note })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return c.json({ error: "A request already exists between you and this person" }, 409);
    return c.json({ error: error.message }, 400);
  }
  return c.json({ connection: data }, 201);
});

network.post("/requests/:id/accept", async (c) => {
  const { data, error } = await c
    .get("supabase")
    .from("connections")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("id", c.req.param("id"))
    .eq("addressee_id", c.get("userId"))
    .eq("status", "pending")
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ connection: data });
});

// Declining is a delete, not a status flip — connections.status only ever
// holds 'pending'/'accepted' (0027's check constraint), so a declined
// request leaves no record for either party to see, and the requester is
// free to send another request later if circumstances change.
network.delete("/requests/:id", async (c) => {
  const { error } = await c
    .get("supabase")
    .from("connections")
    .delete()
    .eq("id", c.req.param("id"))
    .eq("addressee_id", c.get("userId"))
    .eq("status", "pending");

  if (error) return c.json({ error: error.message }, 400);
  return c.body(null, 204);
});

// Cancel a request I sent, or remove an existing connection — either party
// to a connections row can delete it (0027's connections_parties_delete).
network.delete("/connections/:id", async (c) => {
  const { error } = await c
    .get("supabase")
    .from("connections")
    .delete()
    .eq("id", c.req.param("id"));

  if (error) return c.json({ error: error.message }, 400);
  return c.body(null, 204);
});

export default network;
