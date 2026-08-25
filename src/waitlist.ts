import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { sendTransactionalEmail } from "./email";
import { waitlistWelcomeEmail, EARLY_SUPPORTER_THRESHOLD } from "./emails/waitlist-welcome";
import { employerWaitlistEmail } from "./emails/employer-waitlist";

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
  const role = body?.role === "employer" ? "employer" : "candidate";
  const orgName = typeof body?.org_name === "string" ? body.org_name.trim() : "";

  if (!email) return c.json({ error: "email is required" }, 400);
  if (!fullName) return c.json({ error: "full_name is required" }, 400);
  if (role === "employer" && !orgName) return c.json({ error: "org_name is required" }, 400);

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { error } = await supabase
    .from("waitlist")
    .insert({ email, full_name: fullName, phone, role, org_name: role === "employer" ? orgName : null });

  if (error) {
    // Unique violation — they're already on the list, treat as success.
    if (error.code === "23505") return c.json({ status: "ok", already_joined: true });
    return c.json({ error: error.message }, 400);
  }

  const { data: position } = await supabase.rpc("waitlist_count", { p_role: role });
  const isEarlySupporter = typeof position === "number" && position <= EARLY_SUPPORTER_THRESHOLD;
  const landingUrl = new URL(c.req.url).origin;

  const { subject, html } =
    role === "employer"
      ? employerWaitlistEmail({ fullName, orgName, isEarlySupporter, landingUrl })
      : waitlistWelcomeEmail({ fullName, isEarlySupporter, landingUrl });
  await sendTransactionalEmail(c.env, email, subject, html);

  return c.json({ status: "ok", position, is_early_supporter: isEarlySupporter }, 201);
});

waitlist.get("/count", async (c) => {
  const role = c.req.query("role") === "employer" ? "employer" : "candidate";
  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.rpc("waitlist_count", { p_role: role });
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ count: data });
});

export default waitlist;
