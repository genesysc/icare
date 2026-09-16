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

// Email OTP — the original way to create an account, and still a fallback
// for both sign-up and sign-in (see 2026-09-16 note in HANDOVER.md §6 —
// password collection was added to sign-up too, this stays available as
// "sign up/in with a code instead"). One entry point handles both sign-up
// and sign-in; `create` (maps to Supabase's shouldCreateUser) is the only
// difference — a sign-in screen should pass create: false so an
// unrecognised email doesn't silently create an account. `role`/
// `full_name`/`org_name`/`terms_version` match what the handle_new_user()
// DB trigger reads from raw_user_meta_data to create the accounts row (and
// candidates/employers row) automatically.
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
  const { email, token, type } = await c.req.json();
  if (!email || !token) {
    return c.json({ error: "email and token are required" }, 400);
  }

  // "email" is the OTP type for signInWithOtp's codes (the original flow);
  // "signup" is the type for a code from /sign-up-password's signUp() call
  // below — Supabase rejects a code verified against the wrong type even
  // though the codes look identical to a user. The frontend tells us which
  // flow it's in via `type`; default to "email" for every existing caller.
  const otpType = type === "signup" ? "signup" : "email";

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: otpType });

  if (error) return c.json({ error: error.message }, 401);
  return c.json({ user: data.user, session: data.session });
});

// Password sign-up — 2026-09-16, alongside password sign-in. Uses
// Supabase's own signUp() (not signInWithOtp) specifically because it's
// the one call that both sets a password AND accepts the same `data`
// payload handle_new_user() reads — so candidate/employer account
// creation works exactly like the OTP signup path, just with a password
// set from the start. Supabase emails a confirmation (code or link,
// same as the OTP flow) rather than returning a session immediately.
auth.post("/sign-up-password", async (c) => {
  const { email, password, role, full_name, org_name, terms_version } = await c.req.json();
  if (!email || !password) {
    return c.json({ error: "email and password are required" }, 400);
  }
  if (role !== "candidate" && role !== "employer") {
    return c.json({ error: "role must be 'candidate' or 'employer'" }, 400);
  }
  if (password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters." }, 400);
  }

  const redirectTo = new URL("/verify", c.req.url);
  redirectTo.searchParams.set("email", email);
  redirectTo.searchParams.set("role", role);
  redirectTo.searchParams.set("flow", "signup-password");

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo.toString(),
      data: { signup_role: role, full_name, org_name, terms_version },
    },
  });

  if (error) return c.json({ error: error.message }, 400);
  // A session comes back immediately only if the project has email
  // confirmation turned off; normally it's null until the code/link is
  // used, same shape as the existing OTP signup path.
  return c.json({ status: "ok", session: data.session ?? null });
});

// Resends a signup confirmation code/link — a distinct call from
// request-code's resend, because a signUp()-created (unconfirmed) user
// needs Supabase's `resend({type: "signup"})`, not another
// signInWithOtp() (which would 400 against an account that already has a
// password and a pending signup confirmation, rather than a passwordless
// OTP one).
auth.post("/resend-signup-code", async (c) => {
  const { email } = await c.req.json();
  if (!email) return c.json({ error: "email is required" }, 400);

  const redirectTo = new URL("/verify", c.req.url);
  redirectTo.searchParams.set("email", email);

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: redirectTo.toString() },
  });

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ status: "ok" });
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
//
// `role`/`flow` (optional body fields) are carried through as plain query
// params on `redirectTo` — Supabase doesn't touch them, it just redirects
// the browser to that exact URL with the session tokens appended to the
// hash, so they arrive on /verify intact alongside the tokens. This is how
// /verify knows an OAuth sign-up was for "employer" even though
// signInWithOAuth has no `data` option to tell handle_new_user() that
// directly — see complete-oauth-employer-signup below for the rest of
// that story.
const OAUTH_PROVIDERS = new Set(["google", "linkedin_oidc"]);
auth.post("/oauth/:provider", async (c) => {
  const provider = c.req.param("provider");
  if (!OAUTH_PROVIDERS.has(provider)) {
    return c.json({ error: "Unsupported sign-in provider." }, 400);
  }
  const { role, flow } = await c.req.json().catch(() => ({}) as { role?: string; flow?: string });

  const redirectTo = new URL("/verify", c.req.url);
  if (role === "candidate" || role === "employer") redirectTo.searchParams.set("role", role);
  if (flow) redirectTo.searchParams.set("flow", flow);

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as "google" | "linkedin_oidc",
    options: { redirectTo: redirectTo.toString(), skipBrowserRedirect: true },
  });

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ url: data.url });
});

// Completes an OAuth sign-up that was actually for an employer account.
// handle_new_user() has no role signal for a fresh OAuth user and always
// defaults to 'candidate' (see migration 0043) — fine for candidates, but
// an employer who clicked "Continue with Google" on /employer/sign-up
// needs converting, plus the org_name only a human can supply. Calls the
// security-definer RPC, which itself guards this to only ever apply to an
// account created in the last 10 minutes — see the migration for why.
auth.post("/complete-oauth-employer-signup", requireAuth, async (c) => {
  const { org_name, terms_version } = await c.req.json();
  if (!org_name || !String(org_name).trim()) {
    return c.json({ error: "Organisation name is required." }, 400);
  }

  const { error } = await c.get("supabase").rpc("complete_oauth_employer_signup", {
    p_org_name: org_name,
    p_terms_version: terms_version ?? null,
  });

  if (error) return c.json({ error: error.message }, 400);
  return c.json({ status: "ok" });
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

// Narrow, single-field update — added 2026-09-16 so /verify can backfill
// full_name after an OAuth sign-up when the provider's raw_user_meta_data
// didn't populate it (varies by provider; Google reliably sets it, some
// OIDC providers only set `name`). Deliberately only ever WRITES when the
// account's own full_name is still empty, never overwrites a real one —
// enforced here, not just trusted to the caller.
auth.patch("/me", requireAuth, async (c) => {
  const { full_name } = await c.req.json();
  const trimmed = typeof full_name === "string" ? full_name.trim() : "";
  if (!trimmed) return c.json({ error: "full_name is required" }, 400);

  const supabase = c.get("supabase");
  const { data: existing, error: readError } = await supabase
    .from("accounts")
    .select("full_name")
    .eq("id", c.get("userId"))
    .single();
  if (readError) return c.json({ error: readError.message }, 500);
  if (existing.full_name) return c.json({ status: "ok", account: existing });

  const { data: account, error } = await supabase
    .from("accounts")
    .update({ full_name: trimmed })
    .eq("id", c.get("userId"))
    .select("id, role, full_name, email, status")
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json({ status: "ok", account });
});

export default auth;
