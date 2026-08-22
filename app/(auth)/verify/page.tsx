import { redirect } from "next/navigation";
import { VerifyForm } from "./verify-form";

export const metadata = { title: "Enter your code" };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; sent?: string }>;
}) {
  const { email, sent } = await searchParams;
  if (!email) redirect("/join");

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Check your email</h1>
      <p className="mt-2 text-slate-600">
        We sent a six-digit code to <span className="font-medium text-slate-900">{email}</span>. It
        works for ten minutes.
      </p>

      {sent && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
          New code sent.
        </p>
      )}

      <div className="mt-8">
        <VerifyForm email={email} />
      </div>
    </main>
  );
}
