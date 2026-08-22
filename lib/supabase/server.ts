// Server client, for server components, route handlers and server actions.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a server component, where cookies are read-only.
            // The middleware refreshes the session, so this is safe to swallow.
          }
        },
      },
    }
  );
}

/**
 * The one function to use for "who is this, and what are they allowed to do".
 * Always calls getUser() — never getSession() — because getUser() revalidates
 * the token against Supabase. getSession() reads the cookie and trusts it,
 * which is fine for rendering a name and not fine for an access decision.
 */
export async function getViewer() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: account } = await supabase
    .from("accounts")
    .select("id, role, full_name, email, status")
    .eq("id", user.id)
    .single();

  if (!account || account.status !== "active") return null;

  let employerVerified = false;
  if (account.role === "employer") {
    const { data: employer } = await supabase
      .from("employers")
      .select("is_verified, org_name")
      .eq("id", user.id)
      .single();
    employerVerified = Boolean(employer?.is_verified);
  }

  return { ...account, employerVerified, emailConfirmed: Boolean(user.email_confirmed_at) };
}
