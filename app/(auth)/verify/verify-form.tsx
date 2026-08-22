"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { verifyCode, resendCode } from "../actions";
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
      {pending ? "Checking…" : "Continue"}
    </button>
  );
}

export function VerifyForm({ email }: { email: string }) {
  const [state, formAction] = useActionState<AuthState, FormData>(verifyCode, null);

  return (
    <div className="space-y-5">
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="email" value={email} />

        <div>
          <label htmlFor="token" className="mb-1.5 block text-sm font-medium text-slate-900">
            Six-digit code
          </label>
          <input
            id="token"
            name="token"
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-3
                       text-center font-mono text-2xl tracking-[0.5em] text-slate-900
                       placeholder:text-slate-300 focus-visible:outline focus-visible:outline-2
                       focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
          />
        </div>

        {state?.error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2.5 text-sm text-red-800">
            {state.error}
          </p>
        )}

        <Submit />
      </form>

      <form action={resendCode}>
        <input type="hidden" name="email" value={email} />
        <button
          type="submit"
          className="text-sm font-medium text-emerald-800 underline underline-offset-4"
        >
          Send a new code
        </button>
      </form>
    </div>
  );
}
