import { Hono } from "hono";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { requireAuth } from "./middleware";

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
};

type Variables = {
  supabase: SupabaseClient;
  userId: string;
  user: User;
};

const auth = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Email OTP, no passwords — this audience returns every few months, and a
// forgotten password is a lost candidate (per HANDOVER.md). One entry
// point handles both sign-up and sign-in; `create` (maps to Supabase's
// shouldCreateUser) is the only difference — a sign-in screen should pass
// create: false so an unrecognised email doesn't silently create an
// account. `role`/`full_name`/`org_name`/`terms_version` match what the
// handle_new_user() DB trigger reads from raw_user_meta_data to create the
// accounts row (and candidates/employers row) automatically.
auth.post("/request-code", async (c) => {
  const body = await c.req.json();
  const { email, role, full_name, org_name, terms_version } = body;
  const create = body.create !== false;

  if (!email) return c.json({ error: "email is required" }, 400);
  if (create && role !== "candidate" && role !== "employer") {
    return c.json({ error: "role must be 'candidate' or 'employer'" }, 400);
  }

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: create,
      data: create ? { signup_role: role, full_name, org_name, terms_version } : undefined,
    },
  });

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ status: "ok" });
});

auth.post("/verify-code", async (c) => {
  const { email, token } = await c.req.json();
  if (!email || !token) {
    return c.json({ error: "email and token are required" }, 400);
  }

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

  if (error) return c.json({ error: error.message }, 401);
  return c.json({ user: data.user, session: data.session });
});

auth.post("/logout", requireAuth, async (c) => {
  const { error } = await c.get("supabase").auth.signOut();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ status: "ok" });
});

auth.get("/me", requireAuth, async (c) => {
  const { data: account, error } = await c
    .get("supabase")
    .from("accounts")
    .select("id, role, full_name, email, status")
    .eq("id", c.get("userId"))
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ user: c.get("user"), account });
});

export default auth;
