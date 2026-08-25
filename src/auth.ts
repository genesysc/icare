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

// Matches the signup_role/full_name/org_name/terms_version fields the
// handle_new_user() DB trigger reads from raw_user_meta_data to create the
// accounts row (and candidates/employers row) automatically.
auth.post("/signup", async (c) => {
  const body = await c.req.json();
  const { email, password, role, full_name, org_name, terms_version } = body;

  if (!email || !password) {
    return c.json({ error: "email and password are required" }, 400);
  }
  if (role !== "candidate" && role !== "employer") {
    return c.json({ error: "role must be 'candidate' or 'employer'" }, 400);
  }

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { signup_role: role, full_name, org_name, terms_version },
    },
  });

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ user: data.user, session: data.session });
});

auth.post("/login", async (c) => {
  const { email, password } = await c.req.json();
  if (!email || !password) {
    return c.json({ error: "email and password are required" }, 400);
  }

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

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
