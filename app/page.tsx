import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight text-slate-900">care·register</h1>
      <p className="mt-3 text-lg text-slate-600">
        A jobs platform for UK health and social care. Free for candidates, always — employers pay
        to search and shortlist.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/join"
          className="rounded-md bg-emerald-800 px-5 py-3 font-medium text-white transition hover:bg-emerald-900"
        >
          Find work
        </Link>
        <Link
          href="/join?role=employer"
          className="rounded-md border border-slate-300 bg-white px-5 py-3 font-medium text-slate-700 transition hover:border-slate-400"
        >
          Hire people
        </Link>
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
