"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { StepState } from "./types";

/**
 * Fired when a step's page renders. Persists which step the candidate is on
 * (so a reload or a later sign-in resumes here) and logs an 'entered' event
 * for the onboarding_funnel view — that's the only way to see where people
 * stop without watching four hundred people fill in a form live.
 */
export async function enterStep(step: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("candidates").update({ onboarding_step: step }).eq("id", user.id);
  await supabase.from("onboarding_events").insert({ candidate_id: user.id, step, event: "entered" });
}

async function logCompleted(candidateId: string, step: number) {
  const supabase = await createClient();
  await supabase.from("onboarding_events").insert({ candidate_id: candidateId, step, event: "completed" });
}

/* -- Step 1: what do you do ----------------------------------------------- */

export async function saveRole(_prev: StepState, form: FormData): Promise<StepState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const professionId = String(form.get("profession_id") ?? "");
  if (!professionId) return { error: "Choose the role you're looking for." };

  await supabase.from("candidate_professions").delete().eq("candidate_id", user.id);
  await supabase.from("candidate_professions").insert({
    candidate_id: user.id,
    profession_id: professionId,
    is_primary: true,
  });

  const regulator = String(form.get("regulator") ?? "");
  const regNumber = String(form.get("reg_number") ?? "").trim();
  if (regulator && regNumber) {
    await supabase.from("registrations").upsert(
      { candidate_id: user.id, regulator, reg_number: regNumber, status: "submitted" },
      { onConflict: "candidate_id,regulator,reg_number" }
    );
  }

  await logCompleted(user.id, 1);
  redirect("/candidate/onboarding?step=2");
}

/* -- Step 2: where and when ------------------------------------------------ */

const POSTCODE_DISTRICT = /^[A-Z]{1,2}\d{1,2}[A-Z]?$/;

export async function saveAvailability(_prev: StepState, form: FormData): Promise<StepState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const district = String(form.get("postcode_district") ?? "").trim().toUpperCase();
  if (!POSTCODE_DISTRICT.test(district)) {
    return { error: "Enter the first part of your postcode only — EN1, N17, BT38." };
  }

  const availability = String(form.get("availability") ?? "open_to_offers");
  const availableFrom = String(form.get("available_from") ?? "");

  await supabase.from("candidates").update({
    postcode_district: district,
    town: String(form.get("town") ?? "").trim() || null,
    travel_radius_miles: Number(form.get("travel_radius_miles") ?? 10) || 10,
    availability,
    available_from: availability === "available_from" && availableFrom ? availableFrom : null,
    shift_prefs: form.getAll("shift_prefs").map(String),
    has_driving_licence: form.get("has_driving_licence") === "on",
    has_own_vehicle: form.get("has_own_vehicle") === "on",
  }).eq("id", user.id);

  await logCompleted(user.id, 2);
  redirect("/candidate/onboarding?step=3");
}

/* -- Step 3: experience ----------------------------------------------------- */

export async function addJob(_prev: StepState, form: FormData): Promise<StepState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const employer = String(form.get("employer") ?? "").trim();
  const jobTitle = String(form.get("job_title") ?? "").trim();
  const startedOn = String(form.get("started_on") ?? "");
  const isCurrent = form.get("is_current") === "on";
  const endedOn = String(form.get("ended_on") ?? "");

  if (!employer || !jobTitle || !startedOn) {
    return { error: "Fill in the employer, job title and start date." };
  }
  if (!isCurrent && !endedOn) {
    return { error: "Add an end date, or tick 'I still work here'." };
  }

  await supabase.from("employment_history").insert({
    candidate_id: user.id,
    employer,
    job_title: jobTitle,
    setting: String(form.get("setting") ?? "") || null,
    started_on: `${startedOn}-01`,
    ended_on: isCurrent ? null : `${endedOn}-01`,
    is_current: isCurrent,
    description: String(form.get("description") ?? "").trim() || null,
  });

  revalidatePath("/candidate/onboarding");
  return undefined;
}

export async function removeJob(form: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const id = String(form.get("job_id"));
  await supabase.from("employment_history").delete().eq("id", id).eq("candidate_id", user.id);
  revalidatePath("/candidate/onboarding");
}

export async function finishExperience() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  await logCompleted(user.id, 3);
  redirect("/candidate/onboarding?step=4");
}

/* -- Step 4: eligibility and DBS -------------------------------------------- */

export async function saveEligibility(_prev: StepState, form: FormData): Promise<StepState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const rightToWork = String(form.get("right_to_work") ?? "not_stated");
  await supabase.from("candidates").update({ right_to_work: rightToWork }).eq("id", user.id);

  const hasDbs = form.get("has_dbs") === "on";
  if (hasDbs) {
    const onUpdateService = form.get("on_update_service") === "on";
    const consent = form.get("consent_to_check") === "on";

    await supabase.from("dbs_records").upsert({
      candidate_id: user.id,
      level: "enhanced",
      on_update_service: onUpdateService,
      consent_to_check: consent,
      consent_given_at: consent ? new Date().toISOString() : null,
    });
  }

  await logCompleted(user.id, 4);
  redirect("/candidate/onboarding?step=5");
}

/* -- Step 5: in your own words, then publish -------------------------------- */

async function finishAndPublish(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: published } = await supabase.rpc("publish_my_profile");
  redirect(published ? "/candidate?published=1" : "/candidate?incomplete=1");
}

export async function savePrompt(_prev: StepState, form: FormData): Promise<StepState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const promptId = String(form.get("prompt_id") ?? "");
  const answer = String(form.get("answer") ?? "").trim();

  if (!promptId || !answer) {
    return { error: "Pick a question and write an answer, or skip this step." };
  }

  await supabase.from("candidate_prompts").upsert(
    { candidate_id: user.id, prompt_id: promptId, answer },
    { onConflict: "candidate_id,prompt_id" }
  );

  await logCompleted(user.id, 5);
  await finishAndPublish(supabase);
}

export async function skipPrompt() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  await supabase.from("onboarding_events").insert({ candidate_id: user.id, step: 5, event: "skipped" });
  await finishAndPublish(supabase);
}
