import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
};

const waitlist = new Hono<{ Bindings: Bindings }>();

waitlist.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email) return c.json({ error: "email is required" }, 400);

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { error } = await supabase.from("waitlist").insert({ email });

  if (error) {
    // Unique violation — they're already on the list, treat as success.
    if (error.code === "23505") return c.json({ status: "ok", already_joined: true });
    return c.json({ error: error.message }, 400);
  }
  return c.json({ status: "ok" }, 201);
});

waitlist.get("/count", async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.rpc("waitlist_count");
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ count: data });
});

export default waitlist;
