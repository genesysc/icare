export const metadata = { title: "Privacy notice" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16 prose">
      <p className="mb-6 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">
        DRAFT — placeholder text, not yet reviewed by a solicitor. Do not treat this as your
        actual privacy notice until it has had legal review.
      </p>

      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Privacy notice</h1>

      <p className="mt-4 text-slate-700">
        care·register is free for candidates to use. We never charge candidates for anything —
        not to view jobs, not to appear in search, not for any feature on the site.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">What we collect</h2>
      <p className="mt-2 text-slate-700">
        Contact details, work history, qualifications and registration numbers you give us
        directly. If you upload a CV, we extract a draft from it for you to review and confirm —
        we do not automatically publish anything from a CV without you checking it first.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">What we deliberately don't collect</h2>
      <p className="mt-2 text-slate-700">
        Date of birth, nationality, immigration status, marital status, gender, religion,
        ethnicity, health information, and National Insurance numbers are not requested, and our
        CV import is instructed not to extract them even when present in an uploaded document.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">Who can see your profile</h2>
      <p className="mt-2 text-slate-700">
        Only verified employers can search, and only your role, badges, experience level, area
        and availability are visible in search results — no photo, name, video or CV. Your full
        profile, video, CV and contact details unlock only once an employer shortlists you and
        you consent.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">DBS certificates</h2>
      <p className="mt-2 text-slate-700">
        We cannot and do not verify DBS certificates. If you tell us you're on the Update
        Service, we display that as "on Update Service" — the employer who shortlists you is
        responsible for running the actual DBS check.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-slate-900">Deleting your account</h2>
      <p className="mt-2 text-slate-700">
        You can close your account at any time. Your profile leaves search immediately; your
        record is retained for a period to meet our regulatory record-keeping duties, then
        deleted.
      </p>

      <p className="mt-8 text-sm text-slate-500">Last updated: placeholder — pending legal review.</p>
    </main>
  );
}
