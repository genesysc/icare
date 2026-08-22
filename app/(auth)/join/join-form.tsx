"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { requestCode } from "../actions";
import type { AuthState } from "../shared";

function Submit({ label }: { label: string }) {
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
      {pending ? "Sending your code…" : label}
    </button>
  );
}

export function JoinForm({ initialRole }: { initialRole: "candidate" | "employer" }) {
  const [role, setRole] = useState(initialRole);
  const [state, formAction] = useActionState<AuthState, FormData>(requestCode, null);

  const field =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-900 " +
    "placeholder:text-slate-400 focus-visible:outline focus-visible:outline-2 " +
    "focus-visible:outline-offset-2 focus-visible:outline-emerald-800";

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="mode" value="join" />
      <input type="hidden" name="role" value={role} />

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-900">I'm here to</legend>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["candidate", "Find work"],
              ["employer", "Hire people"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRole(value)}
              aria-pressed={role === value}
              className={`rounded-md border px-4 py-3 text-sm font-medium transition ${
                role === value
                  ? "border-emerald-800 bg-emerald-800 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="full_name" className="mb-1.5 block text-sm font-medium text-slate-900">
          Full name
        </label>
        <input id="full_name" name="full_name" required autoComplete="name" className={field} />
      </div>

      {role === "employer" && (
        <div>
          <label htmlFor="org_name" className="mb-1.5 block text-sm font-medium text-slate-900">
            Organisation
          </label>
          <input id="org_name" name="org_name" required autoComplete="organization" className={field} />
          <p className="mt-1.5 text-sm text-slate-600">
            We check that you're a real care provider before opening up candidate search. It
            usually takes a working day.
          </p>
        </div>
      )}

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
        <p className="mt-1.5 text-sm text-slate-600">
          We'll send a six-digit code. No password to forget.
        </p>
      </div>

      <label className="flex items-start gap-2.5 text-sm text-slate-700">
        <input
          type="checkbox"
          name="terms"
          required
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-800"
        />
        <span>
          I accept the{" "}
          <a href="/terms" className="text-emerald-800 underline underline-offset-2">terms</a> and{" "}
          <a href="/privacy" className="text-emerald-800 underline underline-offset-2">privacy notice</a>.
        </span>
      </label>

      {state?.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2.5 text-sm text-red-800">
          {state.error}
        </p>
      )}

      <Submit label="Send my code" />
    </form>
  );
}
