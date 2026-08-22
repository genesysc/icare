import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { enterStep } from "./actions";
import { CvGate } from "./_components/cv-gate";
import {
  StepRole,
  StepAvailability,
  StepExperience,
  StepEligibility,
  StepPrompt,
} from "./_components/steps";

export const metadata = { title: "Set up your profile" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; from?: string; added?: string }>;
}) {
  const { step: stepParam, from } = await searchParams;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: candidate } = await supabase
    .from("candidates")
    .select("onboarding_step, onboarding_done, postcode_district, town, travel_radius_miles, availability, has_driving_licence, right_to_work")
    .eq("id", user.id)
    .single();

  if (!candidate) redirect("/candidate");
  if (candidate.onboarding_done && !stepParam) redirect("/candidate");

  const { data: professions } = await supabase
    .from("candidate_professions")
    .select("profession_id")
    .eq("candidate_id", user.id)
    .eq("is_primary", true)
    .maybeSingle();

  const { data: jobs } = await supabase
    .from("employment_history")
    .select("id, employer, job_title, started_on, ended_on")
    .eq("candidate_id", user.id)
    .order("started_on", { ascending: false });

  const { data: cvImports } = await supabase
    .from("cv_imports")
    .select("id")
    .eq("candidate_id", user.id)
    .limit(1);

  const { data: prompts } = await supabase
    .from("prompts")
    .select("id, label, placeholder")
    .eq("active", true)
    .order("sort_order");

  // First visit, no CV tried yet, nothing filled in — offer the shortcut.
  const untouched = !stepParam && !cvImports?.length && !professions && !jobs?.length;
  if (untouched) return <main className="wizard"><CvGate /></main>;

  const step = Number(stepParam ?? candidate.onboarding_step ?? 1);
  await enterStep(step);

  return (
    <main className="wizard">
      <nav className="progress" aria-label="Progress">
        {["Your job", "Where and when", "Experience", "Eligibility", "In your words"].map((label, i) => (
          <span key={label} className={i + 1 <= step ? "on" : ""}>
            {i + 1}. {label}
          </span>
        ))}
      </nav>

      {from === "cv" && (
        <p className="notice">
          <strong>Nearly there.</strong> Your CV covered your job and your work history.
          This last bit it can't tell us: where you are and when you can start.
        </p>
      )}

      {step === 1 && <StepRole initial={professions?.profession_id} />}
      {step === 2 && <StepAvailability initial={candidate} />}
      {step === 3 && <StepExperience existing={jobs ?? []} />}
      {step === 4 && <StepEligibility initial={candidate} />}
      {step === 5 && <StepPrompt prompts={prompts ?? []} />}
    </main>
  );
}
