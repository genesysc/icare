export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16 prose">
      <p className="mb-6 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
        DRAFT — placeholder text, not yet reviewed by a solicitor. Do not treat this as your
        actual terms of service until it has had legal review.
      </p>

      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Terms of use</h1>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">Candidates never pay</h2>
      <p className="mt-2 text-slate-700">
        care·register does not charge candidates a fee, directly or indirectly, for finding
        work, appearing in search, or using any feature of the site. This is not a promotional
        offer — it is how the platform is built and will always operate, in line with the
        Employment Agencies Act 1973 and the Conduct of Employment Agencies and Employment
        Businesses Regulations 2003.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">Employers</h2>
      <p className="mt-2 text-slate-700">
        Employers must be verified before they can search for or contact candidates.
        Verification requirements and pricing are provided separately once an employer account
        is reviewed.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">Badges</h2>
      <p className="mt-2 text-slate-700">
        Badges shown on a candidate's profile are earned, never purchased, and are never
        awarded in exchange for payment of any kind.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">DBS certificates</h2>
      <p className="mt-2 text-slate-700">
        care·register does not verify DBS certificates. Any status shown reflects only what the
        candidate has told us. Employers are responsible for carrying out their own DBS check
        before relying on a certificate.
      </p>

      <p className="mt-8 text-sm text-slate-500">Last updated: placeholder — pending legal review.</p>
    </main>
  );
}
