import Link from "next/link";
import { JoinForm } from "./join-form";

export const metadata = { title: "Create your account" };

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Create your account</h1>
      <p className="mt-2 text-slate-600">
        Free for anyone looking for work in health or social care. Employers pay to find you.
      </p>

      <div className="mt-8">
        <JoinForm initialRole={role === "employer" ? "employer" : "candidate"} />
      </div>

      <p className="mt-8 text-sm text-slate-600">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-medium text-emerald-800 underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </main>
  );
}
