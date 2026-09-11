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

const messages = new Hono<{ Bindings: Bindings; Variables: Variables }>();
messages.use("*", requireAuth);

// Inbox — build spec §4: gated to accepted connections only, enforced once
// at conversation creation (get_or_create_conversation, 0036), not here.
messages.get("/", async (c) => {
  const { data, error } = await c
    .get("supabase")
    .from("conversation_inbox")
    .select("*")
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ conversations: data });
});

// Starts (or resumes) a thread with another candidate. Rejects with the
// RPC's own error if there's no accepted connection between the two —
// Messages has no "request with a note" pattern of its own (that's
// Network's Connect flow); this either opens an existing thread or fails.
messages.post("/conversations", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const otherId = typeof body?.candidate_id === "string" ? body.candidate_id : "";
  if (!otherId) return c.json({ error: "candidate_id is required" }, 400);

  const { data, error } = await c.get("supabase").rpc("get_or_create_conversation", { p_other_candidate_id: otherId });
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ conversation_id: data });
});

messages.get("/conversations/:id", async (c) => {
  const conversationId = c.req.param("id");
  const supabase = c.get("supabase");
  const userId = c.get("userId");

  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) return c.json({ error: error.message }, 400);

  // Mark the other party's messages read now that this candidate has
  // opened the thread — RLS (messages_parties_update, 0036) restricts this
  // to a conversation this candidate is actually a party to.
  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .neq("sender_id", userId)
    .is("read_at", null);

  return c.json({ messages: data });
});

messages.post("/conversations/:id", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) return c.json({ error: "body is required" }, 400);
  if (text.length > 4000) return c.json({ error: "Message is too long — 4000 characters maximum" }, 400);

  const { data, error } = await c
    .get("supabase")
    .from("messages")
    .insert({ conversation_id: c.req.param("id"), sender_id: c.get("userId"), body: text })
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ message: data }, 201);
});

export default messages;
