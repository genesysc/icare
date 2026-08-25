import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { sendTransactionalEmail } from "./email";
import { waitlistWelcomeEmail, EARLY_SUPPORTER_THRESHOLD } from "./emails/waitlist-welcome";

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SENDER_API_KEY?: string;
  SENDER_FROM_EMAIL?: string;
};

const waitlist = new Hono<{ Bindings: Bindings }>();

waitlist.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
  const phone = typeof body?.phone === "string" ? body.phone.trim() : null;

  if (!email) return c.json({ error: "email is required" }, 400);
  if (!fullName) return c.json({ error: "full_name is required" }, 400);

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { error } = await supabase.from("waitlist").insert({ email, full_name: fullName, phone });

  if (error) {
    // Unique violation — they're already on the list, treat as success.
    if (error.code === "23505") return c.json({ status: "ok", already_joined: true });
    return c.json({ error: error.message }, 400);
  }

  const { data: position } = await supabase.rpc("waitlist_count");
  const isEarlySupporter = typeof position === "number" && position <= EARLY_SUPPORTER_THRESHOLD;

  const { subject, html } = waitlistWelcomeEmail({
    fullName,
    isEarlySupporter,
    landingUrl: new URL(c.req.url).origin,
  });
  await sendTransactionalEmail(c.env, email, subject, html);

  return c.json({ status: "ok", position, is_early_supporter: isEarlySupporter }, 201);
});

waitlist.get("/count", async (c) => {
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.rpc("waitlist_count");
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ count: data });
});

export default waitlist;
