import Link from "next/link";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Sign in</h1>
      <p className="mt-2 text-slate-600">We'll send a six-digit code to your email. No password.</p>

      <div className="mt-8">
        <SignInForm />
      </div>

      <p className="mt-8 text-sm text-slate-600">
        New here?{" "}
        <Link href="/join" className="font-medium text-emerald-800 underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </main>
  );
}
