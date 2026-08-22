"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TERMS_VERSION, type AuthState } from "./shared";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * One entry point for both signing up and signing in. If the address is new we
 * create the account; if it exists we just send a code. The candidate never has
 * to work out which button they need, which is most of the drop-off on a
 * two-button auth screen.
 */
export async function requestCode(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "candidate");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const orgName = String(formData.get("org_name") ?? "").trim();
  const accepted = formData.get("terms") === "on";
  const mode = String(formData.get("mode") ?? "join"); // "join" | "sign-in"

  if (!EMAIL.test(email)) {
    return { error: "That email address doesn't look right. Check it and try again.", email };
  }

  if (mode === "join") {
    if (fullName.length < 2) {
      return { error: "Enter your full name.", email };
    }
    if (role === "employer" && orgName.length < 2) {
      return { error: "Enter the name of your organisation.", email };
    }
    if (!accepted) {
      return { error: "Accept the terms and privacy notice to continue.", email };
    }
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // On sign-in we do not want a typo to quietly create a new account.
      shouldCreateUser: mode === "join",
      data:
        mode === "join"
          ? {
              signup_role: role === "employer" ? "employer" : "candidate",
              full_name: fullName,
              org_name: orgName,
              terms_version: TERMS_VERSION,
            }
          : undefined,
    },
  });

  if (error) {
    if (error.status === 429) {
      return { error: "Too many codes requested. Wait a minute and try again.", email };
    }
    if (/signups not allowed|not found/i.test(error.message)) {
      return { error: "No account with that email. Create one instead.", email };
    }
    return { error: "We couldn't send the code. Try again in a moment.", email };
  }

  redirect(`/verify?email=${encodeURIComponent(email)}&mode=${mode}`);
}

export async function verifyCode(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").replace(/\D/g, "");

  if (token.length !== 6) {
    return { error: "Enter the six digits from the email.", email };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

  if (error || !data.user) {
    if (error?.status === 403 || /expired/i.test(error?.message ?? "")) {
      return { error: "That code has expired. Send yourself a new one.", email };
    }
    return { error: "That code isn't right. Check the email and try again.", email };
  }

  const role = (data.user.app_metadata?.role as string) ?? "candidate";

  revalidatePath("/", "layout");
  redirect(role === "employer" ? "/employer" : "/candidate");
}

export async function resendCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const supabase = await createClient();
  await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  redirect(`/verify?email=${encodeURIComponent(email)}&sent=1`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function closeAccount(formData: FormData) {
  const reason = String(formData.get("reason") ?? "");
  const supabase = await createClient();
  await supabase.rpc("close_my_account", { p_reason: reason });
  await supabase.auth.signOut();
  redirect("/?closed=1");
}
