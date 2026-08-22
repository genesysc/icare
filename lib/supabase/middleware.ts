// Refreshes the auth cookie on every request and enforces route access.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = [
  "/",
  "/join",
  "/verify",
  "/sign-in",
  "/auth",
  "/terms",
  "/privacy",
  "/for-employers",
];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(p + "/"))
  );
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Do not remove. This refreshes the token; without it users are silently
  // signed out mid-session.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Role comes from app_metadata, which is written by a database trigger and
  // is not writable by the client. Safe to route on without a database read.
  const role = (user?.app_metadata?.role as string | undefined) ?? null;

  // Signed in, but standing on the door — send them inside.
  if (user && (pathname === "/join" || pathname === "/sign-in" || pathname === "/verify")) {
    return NextResponse.redirect(new URL(home(role), request.url));
  }

  if (isPublic(pathname)) return response;

  if (!user) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/candidate") && role !== "candidate") {
    return NextResponse.redirect(new URL(home(role), request.url));
  }

  if (pathname.startsWith("/employer") && role !== "employer") {
    return NextResponse.redirect(new URL(home(role), request.url));
  }

  return response;
}

function home(role: string | null) {
  if (role === "employer") return "/employer";
  if (role === "admin") return "/admin";
  return "/candidate";
}
