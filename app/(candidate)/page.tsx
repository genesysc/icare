import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";

export default async function CandidateHome({
  searchParams,
}: {
  searchParams: Promise<{ published?: string; incomplete?: string }>;
}) {
  const { published, incomplete } = await searchParams;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: account } = await supabase
    .from("accounts").select("full_name").eq("id", user.id).single();

  const { data: candidate } = await supabase
    .from("candidates")
    .select("is_published, completeness, onboarding_done, availability")
    .eq("id", user.id)
    .single();

  if (!candidate?.onboarding_done && !published && !incomplete) {
    redirect("/candidate/onboarding");
  }

  const { data: badges } = await supabase
    .from("candidate_badges")
    .select("badge_code, badges(label, grade)")
    .eq("candidate_id", user.id);

  const missing = [
    candidate && candidate.completeness < 100 && "a photo",
    "an answer in your own words",
  ].filter(Boolean);

  return (
    <main className="wizard">
      <h1>Hello {account?.full_name?.split(" ")[0] ?? "there"}</h1>

      {published && (
        <div className="notice">
          <strong>Your profile is live.</strong>
          <p>
            Employers in your area can find you from now on. We're new and starting in
            North London, so it may be quiet at first — we'll email you the moment
            someone shortlists you.
          </p>
        </div>
      )}

      {incomplete && (
        <div className="notice">
          <strong>Almost there.</strong>
          <p>
            We still need your job, your area, your right to work and at least one previous
            job before employers can find you.{" "}
            <Link href="/candidate/onboarding">Finish it off</Link>.
          </p>
        </div>
      )}

      <section>
        <h2>Your profile</h2>
        <p>{candidate?.completeness ?? 0}% complete · {candidate?.is_published ? "Live" : "Not live yet"}</p>
        {missing.length > 0 && (
          <p className="fine">Adding {missing.join(" and ")} makes a real difference to how often you're found.</p>
        )}
        <Link href="/candidate/profile" className="btn-primary">Edit my profile</Link>
      </section>

      <section>
        <h2>Your badges</h2>
        <ul className="added">
          {(badges ?? []).map((b) => (
            <li key={b.badge_code}>
              {/* @ts-expect-error supabase join typing */}
              {b.badges?.label} <span className="fine">· {b.badges?.grade}</span>
            </li>
          ))}
        </ul>
        <p className="fine">Badges are earned, never bought. Nobody can pay to appear above you.</p>
      </section>

      <form action={signOut}>
        <button type="submit" className="btn-link">Sign out</button>
      </form>
    </main>
  );
}
