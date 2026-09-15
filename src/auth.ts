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

// Email OTP — the original (and still the only) way to CREATE an account;
// sign-up stays OTP-only deliberately (see 2026-09-15 note in HANDOVER.md
// §6 on why password collection wasn't added to sign-up too). It's also
// still a fallback sign-in method for accounts that haven't set a password
// yet (see /sign-in-password below for the newer primary path). One entry
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

  const redirectTo = new URL("/verify", c.req.url);
  redirectTo.searchParams.set("email", email);
  if (create && role) redirectTo.searchParams.set("role", role);

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: create,
      emailRedirectTo: redirectTo.toString(),
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

// Password sign-in — added 2026-09-15 alongside the OTP flow above (kept as
// a fallback, see HANDOVER.md §6). Existing accounts were all created
// OTP-only, so a great many have no password set yet; Supabase returns the
// same generic "Invalid login credentials" for a wrong password and for no
// password set at all (by design, so a login form can't be used to probe
// which emails have accounts) — the frontend copy accounts for that
// ambiguity rather than trying to disambiguate it here.
auth.post("/sign-in-password", async (c) => {
  const { email, password } = await c.req.json();
  if (!email || !password) {
    return c.json({ error: "email and password are required" }, 400);
  }

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return c.json({ error: "Incorrect email or password." }, 401);
  return c.json({ user: data.user, session: data.session });
});

// Sends a password-reset email (also doubles as "set your first password"
// for the many pre-existing OTP-only accounts). Always returns { status:
// "ok" } regardless of whether the email matches an account, so this route
// can't be used to enumerate which emails are registered.
auth.post("/forgot-password", async (c) => {
  const { email } = await c.req.json();
  if (!email) return c.json({ error: "email is required" }, 400);

  const redirectTo = new URL("/reset-password", c.req.url);

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo.toString() });

  return c.json({ status: "ok" });
});

// Completes a password reset/set — called with the recovery session's own
// access token (the token from the emailed link, same implicit-flow shape
// verify.html already handles for magic links) via requireAuth.
auth.post("/update-password", requireAuth, async (c) => {
  const { password } = await c.req.json();
  if (!password || password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters." }, 400);
  }

  const { error } = await c.get("supabase").auth.updateUser({ password });
  if (error) return c.json({ error: error.message }, 400);
  return c.json({ status: "ok" });
});

// Generic OAuth-initiate — returns the provider's authorize URL for the
// browser to redirect to; the callback lands on /verify, which already
// knows how to complete a session from #access_token=&refresh_token= in the
// URL hash (built for the magic-link path, same implicit-flow shape Supabase
// uses for OAuth). Allow-listed to providers actually wired on the frontend
// (see HANDOVER.md's auth section) — each still needs a real Client ID/
// Secret configured in Supabase Dashboard → Authentication → Providers
// before it will work; that's a manual step outside this codebase.
const OAUTH_PROVIDERS = new Set(["google", "linkedin_oidc"]);
auth.post("/oauth/:provider", async (c) => {
  const provider = c.req.param("provider");
  if (!OAUTH_PROVIDERS.has(provider)) {
    return c.json({ error: "Unsupported sign-in provider." }, 400);
  }

  const redirectTo = new URL("/verify", c.req.url);

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as "google" | "linkedin_oidc",
    options: { redirectTo: redirectTo.toString(), skipBrowserRedirect: true },
  });

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ url: data.url });
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
