"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { requestCode } from "../actions";
import type { AuthState } from "../shared";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-emerald-800 px-4 py-3 font-medium text-white
                 transition hover:bg-emerald-900 focus-visible:outline focus-visible:outline-2
                 focus-visible:outline-offset-2 focus-visible:outline-emerald-800
                 disabled:opacity-60"
    >
      {pending ? "Sending your code…" : "Send my code"}
    </button>
  );
}

export function SignInForm() {
  const [state, formAction] = useActionState<AuthState, FormData>(requestCode, null);

  const field =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-900 " +
    "placeholder:text-slate-400 focus-visible:outline focus-visible:outline-2 " +
    "focus-visible:outline-offset-2 focus-visible:outline-emerald-800";

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="mode" value="sign-in" />

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-900">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          defaultValue={state?.email}
          className={field}
        />
      </div>

      {state?.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2.5 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <Submit />
    </form>
  );
}
