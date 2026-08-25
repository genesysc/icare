import { createMiddleware } from "hono/factory";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
};

type Variables = {
  supabase: SupabaseClient;
  userId: string;
  user: User;
};

// Authenticates the caller's bearer token and attaches a Supabase client
// scoped to that user (via the same token), so RLS applies exactly as it
// would for any other client — no service_role key involved.
export const requireAuth = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    const header = c.req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
    if (!token) return c.json({ error: "missing bearer token" }, 401);

    const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return c.json({ error: "invalid session" }, 401);

    c.set("supabase", supabase);
    c.set("userId", data.user.id);
    c.set("user", data.user);
    await next();
  }
);
