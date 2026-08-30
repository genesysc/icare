"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ONBOARDING_STEPS } from "@/lib/types";

function StepThreeExperience() {
  return (
    <>
      <p className="mb-1.5 font-display text-xl font-semibold text-icare-ink">
        Where have you worked?
      </p>
      <p className="mb-4 text-[14px] text-icare-mute">
        Add the settings you've worked in. You can add more later.
      </p>
      <div className="mb-2.5 rounded-xl border border-icare-line bg-white p-3.5">
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-icare-mute">
          Setting
        </p>
        <input className="w-full border-0 p-0 text-[14px] outline-none" placeholder="e.g. Acute medical ward" />
      </div>
      <div className="mb-2.5 rounded-xl border border-icare-line bg-white p-3.5">
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-icare-mute">
          Years in this setting
        </p>
        <input className="w-24 border-0 p-0 text-[14px] outline-none" placeholder="e.g. 4" />
      </div>
      <button className="mb-4 w-full rounded-xl border border-dashed border-icare-line py-3 font-mono text-[11px] text-icare-mute">
        + Add another setting
      </button>
    </>
  );
}

function GenericStepPlaceholder({ title }: { title: string }) {
  return (
    <>
      <p className="mb-1.5 font-display text-xl font-semibold text-icare-ink">{title}</p>
      <p className="mb-4 text-[14px] text-icare-mute">Step content to be built.</p>
      <div className="rounded-xl border border-dashed border-icare-line py-8 text-center font-mono text-[11px] text-icare-mute">
        {title} form goes here
      </div>
    </>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(3); // demo starts at step 3 per wireframe
  const step = ONBOARDING_STEPS[stepIndex - 1];
  const progressPercent = (stepIndex / ONBOARDING_STEPS.length) * 100;

  function next() {
    if (stepIndex === ONBOARDING_STEPS.length) {
      router.push("/home");
      return;
    }
    setStepIndex((s) => s + 1);
  }

  return (
    <div className="mx-auto max-w-[480px] px-4 pb-24 pt-5 sm:pt-8">
      <div className="mb-1 flex items-center justify-between">
        <div className="h-1 flex-1 rounded-full bg-icare-lavender">
          <div
            className="h-1 rounded-full bg-icare-purple transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <button
          onClick={() => router.push("/home")}
          className="ml-3 whitespace-nowrap font-mono text-[10px] text-icare-mute"
        >
          Save &amp; exit
        </button>
      </div>
      <p className="mb-5 font-mono text-[10.5px] uppercase tracking-wide text-icare-mute">
        Step {step.index} of {ONBOARDING_STEPS.length} · {step.title}
      </p>

      {stepIndex === 3 ? <StepThreeExperience /> : <GenericStepPlaceholder title={step.title} />}

      {step.findableFrom && stepIndex === 3 && (
        <div className="mb-4 rounded-xl border border-dashed border-icare-line bg-icare-lavender/40 p-3.5">
          <p className="text-[12px] leading-relaxed text-icare-ink">
            <strong>After this step your profile can be found by employers.</strong> The remaining
            steps make it stronger, but you can stop here and come back.
          </p>
        </div>
      )}

      <button onClick={next} className="w-full rounded-full bg-icare-purple py-3.5 text-[15px] font-bold text-white">
        {stepIndex === ONBOARDING_STEPS.length ? "Finish" : "Continue"}
      </button>
      <p className="mt-3 text-center">
        <button onClick={() => router.push("/home")} className="font-mono text-[11px] text-icare-mute">
          Finish later
        </button>
      </p>
    </div>
  );
}
