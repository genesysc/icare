"use client";

import { useEffect, useState, useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  saveRole,
  saveAvailability,
  addJob,
  removeJob,
  finishExperience,
  saveEligibility,
  savePrompt,
  skipPrompt,
} from "../actions";
import { uploadCv, applyCvDraft, discardCv, getImport } from "../cv-actions";
import type { StepState } from "../types";

/* -- reference data --------------------------------------------------------
   Duplicated here rather than loaded server-side, matching how the rest of
   this wizard already works — see the note in CLAUDE.md about steps.tsx and
   the profession list. If this list changes, change professions in
   0001_init.sql too.
--------------------------------------------------------------------------- */

const PROFESSIONS: { id: string; family: string; name: string; regulator: string | null }[] = [
  { id: "care_assistant", family: "Social care", name: "Care Assistant", regulator: null },
  { id: "senior_carer", family: "Social care", name: "Senior Care Assistant", regulator: null },
  { id: "support_worker", family: "Social care", name: "Support Worker", regulator: null },
  { id: "live_in_carer", family: "Social care", name: "Live-in Carer", regulator: null },
  { id: "registered_manager", family: "Social care", name: "Registered Manager", regulator: null },
  { id: "social_worker", family: "Social care", name: "Social Worker", regulator: "swe" },
  { id: "rgn", family: "Nursing", name: "Registered Nurse (Adult)", regulator: "nmc" },
  { id: "rmn", family: "Nursing", name: "Registered Nurse (Mental Health)", regulator: "nmc" },
  { id: "rnld", family: "Nursing", name: "Registered Nurse (LD)", regulator: "nmc" },
  { id: "nursing_associate", family: "Nursing", name: "Nursing Associate", regulator: "nmc" },
  { id: "midwife", family: "Nursing", name: "Midwife", regulator: "nmc" },
  { id: "hca", family: "Nursing", name: "Healthcare Assistant", regulator: null },
  { id: "physiotherapist", family: "Allied health", name: "Physiotherapist", regulator: "hcpc" },
  { id: "occupational_therapist", family: "Allied health", name: "Occupational Therapist", regulator: "hcpc" },
  { id: "podiatrist", family: "Allied health", name: "Podiatrist", regulator: "hcpc" },
  { id: "paramedic", family: "Allied health", name: "Paramedic", regulator: "hcpc" },
  { id: "slt", family: "Allied health", name: "Speech & Language Therapist", regulator: "hcpc" },
  { id: "dietitian", family: "Allied health", name: "Dietitian", regulator: "hcpc" },
  { id: "radiographer", family: "Allied health", name: "Radiographer", regulator: "hcpc" },
  { id: "dentist", family: "Dental", name: "Dentist", regulator: "gdc" },
  { id: "dental_nurse", family: "Dental", name: "Dental Nurse", regulator: "gdc" },
  { id: "dental_hygienist", family: "Dental", name: "Dental Hygienist", regulator: "gdc" },
  { id: "pharmacist", family: "Pharmacy", name: "Pharmacist", regulator: "gphc" },
  { id: "pharmacy_technician", family: "Pharmacy", name: "Pharmacy Technician", regulator: "gphc" },
  { id: "activities_coord", family: "Support", name: "Activities Coordinator", regulator: null },
  { id: "care_admin", family: "Support", name: "Care Administrator", regulator: null },
  { id: "domestic", family: "Support", name: "Domestic / Housekeeping", regulator: null },
  { id: "chef", family: "Support", name: "Care Home Chef", regulator: null },
];

const REGULATOR_LABEL: Record<string, string> = {
  nmc: "NMC",
  hcpc: "HCPC",
  gdc: "GDC",
  gphc: "GPhC",
  swe: "Social Work England",
};

const SETTINGS: { id: string; label: string }[] = [
  { id: "domiciliary", label: "Domiciliary" },
  { id: "residential", label: "Residential" },
  { id: "nursing_home", label: "Nursing home" },
  { id: "supported_living", label: "Supported living" },
  { id: "hospital", label: "Hospital" },
  { id: "hospice", label: "Hospice" },
  { id: "learning_disability", label: "Learning disability" },
  { id: "mental_health", label: "Mental health" },
];

const RIGHT_TO_WORK: { id: string; label: string }[] = [
  { id: "british_irish", label: "British or Irish" },
  { id: "settled", label: "Settled" },
  { id: "pre_settled", label: "Pre-settled" },
  { id: "indefinite_leave", label: "Indefinite leave" },
  { id: "visa_with_work_rights", label: "Visa with work rights" },
  { id: "requires_sponsorship", label: "I need sponsorship" },
];

const SHIFTS: { id: string; label: string }[] = [
  { id: "days", label: "Days" },
  { id: "nights", label: "Nights" },
  { id: "waking_nights", label: "Waking nights" },
  { id: "weekends", label: "Weekends" },
  { id: "live_in", label: "Live-in" },
];

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Saving…" : children}
    </button>
  );
}

function ErrorText({ state }: { state: StepState }) {
  if (!state?.error) return null;
  return <p className="error">{state.error}</p>;
}

/* =========================================================================
   STEP 1 — what do you do
   ========================================================================= */

export function StepRole({ initial }: { initial?: string }) {
  const [state, formAction] = useActionState<StepState, FormData>(saveRole, undefined);
  const [professionId, setProfessionId] = useState(initial ?? "");

  const profession = PROFESSIONS.find((p) => p.id === professionId);
  const families = Array.from(new Set(PROFESSIONS.map((p) => p.family)));

  return (
    <form action={formAction}>
      <h2>What do you do?</h2>
      <p>Pick the work you want next, not only what you've done before.</p>

      <label htmlFor="profession_id">
        Role
        <select
          id="profession_id"
          name="profession_id"
          value={professionId}
          onChange={(e) => setProfessionId(e.target.value)}
          required
        >
          <option value="">Choose a role…</option>
          {families.map((family) => (
            <optgroup key={family} label={family}>
              {PROFESSIONS.filter((p) => p.family === family).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {profession?.regulator && (
        <fieldset>
          <legend>Verification available</legend>
          <input type="hidden" name="regulator" value={profession.regulator} />
          <label htmlFor="reg_number">
            {REGULATOR_LABEL[profession.regulator]} registration number
            <input id="reg_number" name="reg_number" placeholder="Registration number" />
          </label>
          <p className="fine">
            We check this against the {REGULATOR_LABEL[profession.regulator]} public register. It's the
            strongest signal on your profile.
          </p>
        </fieldset>
      )}

      <ErrorText state={state} />

      <div className="actions">
        <Submit>Continue</Submit>
      </div>
    </form>
  );
}

/* =========================================================================
   STEP 2 — where and when
   ========================================================================= */

export function StepAvailability({
  initial,
}: {
  initial: {
    postcode_district: string | null;
    town: string | null;
    travel_radius_miles: number | null;
    availability: string;
    has_driving_licence: boolean | null;
  };
}) {
  const [state, formAction] = useActionState<StepState, FormData>(saveAvailability, undefined);
  const [availability, setAvailability] = useState(initial.availability ?? "open_to_offers");

  return (
    <form action={formAction}>
      <h2>Where and when?</h2>
      <p>We show employers your postcode district and town — never your full address.</p>

      <div className="row">
        <label htmlFor="postcode_district">
          Postcode district
          <input
            id="postcode_district"
            name="postcode_district"
            defaultValue={initial.postcode_district ?? ""}
            placeholder="EN1"
            required
          />
        </label>
        <label htmlFor="town">
          Town
          <input id="town" name="town" defaultValue={initial.town ?? ""} placeholder="Enfield" />
        </label>
      </div>

      <label htmlFor="travel_radius_miles">
        Willing to travel (miles)
        <input
          id="travel_radius_miles"
          name="travel_radius_miles"
          type="number"
          min={0}
          max={50}
          defaultValue={initial.travel_radius_miles ?? 10}
        />
      </label>

      <fieldset>
        <legend>Availability</legend>
        {[
          ["available_now", "Available now"],
          ["available_from", "From a date"],
          ["open_to_offers", "Open to offers"],
        ].map(([id, label]) => (
          <label className="check" key={id}>
            <input
              type="radio"
              name="availability"
              value={id}
              checked={availability === id}
              onChange={() => setAvailability(id)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      {availability === "available_from" && (
        <label htmlFor="available_from">
          Start date
          <input id="available_from" name="available_from" type="date" />
        </label>
      )}

      <fieldset>
        <legend>Shifts you'll take</legend>
        {SHIFTS.map((s) => (
          <label className="check" key={s.id}>
            <input type="checkbox" name="shift_prefs" value={s.id} />
            {s.label}
          </label>
        ))}
      </fieldset>

      <label className="check">
        <input type="checkbox" name="has_driving_licence" defaultChecked={initial.has_driving_licence ?? false} />
        I have a driving licence
      </label>
      <label className="check">
        <input type="checkbox" name="has_own_vehicle" />
        I have my own vehicle
      </label>

      <ErrorText state={state} />

      <div className="actions">
        <Submit>Continue</Submit>
      </div>
    </form>
  );
}

/* =========================================================================
   STEP 3 — experience
   ========================================================================= */

type ExistingJob = {
  id: string;
  employer: string;
  job_title: string;
  started_on: string;
  ended_on: string | null;
};

export function StepExperience({ existing }: { existing: ExistingJob[] }) {
  const [state, formAction] = useActionState<StepState, FormData>(addJob, undefined);
  const [isCurrent, setIsCurrent] = useState(false);

  return (
    <div>
      <h2>Your experience</h2>
      <p>At least one job, with real dates. This is what "5+ Years" gets calculated from.</p>

      {existing.length > 0 && (
        <ul className="added">
          {existing.map((job) => (
            <li key={job.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>
                  <strong>{job.job_title}</strong> · {job.employer}
                  <br />
                  <span className="fine">
                    {job.started_on.slice(0, 7)} – {job.ended_on ? job.ended_on.slice(0, 7) : "Present"}
                  </span>
                </span>
                <form action={removeJob}>
                  <input type="hidden" name="job_id" value={job.id} />
                  <button type="submit" className="btn-link">Remove</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction}>
        <fieldset className="job">
          <legend>Add a job</legend>
          <div className="row">
            <label htmlFor="employer">
              Employer
              <input id="employer" name="employer" required />
            </label>
            <label htmlFor="job_title">
              Job title
              <input id="job_title" name="job_title" required />
            </label>
          </div>

          <label htmlFor="setting">
            Setting
            <select id="setting" name="setting" defaultValue="">
              <option value="">Not sure / other</option>
              {SETTINGS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>

          <div className="row">
            <label htmlFor="started_on">
              Started
              <input id="started_on" name="started_on" type="month" required />
            </label>
            <label htmlFor="ended_on">
              Ended
              <input id="ended_on" name="ended_on" type="month" disabled={isCurrent} />
            </label>
          </div>

          <label className="check">
            <input
              type="checkbox"
              name="is_current"
              checked={isCurrent}
              onChange={(e) => setIsCurrent(e.target.checked)}
            />
            I still work here
          </label>

          <label htmlFor="description">
            What did you do there?
            <textarea id="description" name="description" placeholder="Two sentences is plenty." />
          </label>

          <ErrorText state={state} />

          <div className="actions">
            <Submit>Add job</Submit>
          </div>
        </fieldset>
      </form>

      {existing.length === 0 && (
        <p className="fine">Add at least one job before you can publish — it's what employers filter on first.</p>
      )}

      <form action={finishExperience}>
        <div className="actions">
          <button type="submit" className="btn-primary">Continue</button>
        </div>
      </form>
    </div>
  );
}

/* =========================================================================
   STEP 4 — eligibility and DBS
   ========================================================================= */

export function StepEligibility({ initial }: { initial?: { right_to_work?: string } }) {
  const [state, formAction] = useActionState<StepState, FormData>(saveEligibility, undefined);
  const [rightToWork, setRightToWork] = useState(initial?.right_to_work ?? "british_irish");
  const [hasDbs, setHasDbs] = useState(false);

  return (
    <form action={formAction}>
      <h2>Eligibility and DBS</h2>
      <p>Employers filter on this, so being straight here gets you contacted faster.</p>

      <fieldset>
        <legend>Right to work in the UK</legend>
        {RIGHT_TO_WORK.map((o) => (
          <label className="check" key={o.id}>
            <input
              type="radio"
              name="right_to_work"
              value={o.id}
              checked={rightToWork === o.id}
              onChange={() => setRightToWork(o.id)}
            />
            {o.label}
          </label>
        ))}
      </fieldset>

      {rightToWork === "requires_sponsorship" && (
        <div className="notice">
          <strong>Worth knowing</strong>
          <p>
            Overseas recruitment into care worker and senior care worker roles closed on 22 July 2025.
            In-country switching runs to 22 July 2028. Employers here can still sponsor other roles —
            we'll only show you the ones that can sponsor yours.
          </p>
        </div>
      )}

      <fieldset>
        <legend>DBS</legend>
        <label className="check">
          <input type="checkbox" name="has_dbs" checked={hasDbs} onChange={(e) => setHasDbs(e.target.checked)} />
          I hold an Enhanced DBS
        </label>
      </fieldset>

      {hasDbs && (
        <>
          <label className="check">
            <input type="checkbox" name="on_update_service" />
            It's on the DBS Update Service
          </label>
          <label className="check">
            <input type="checkbox" name="consent_to_check" />
            I consent to a verified employer running an Update Service status check once they shortlist me
          </label>
          <div className="notice">
            <p>
              We store your certificate number but keep it off your public profile. It's released only to
              an employer you've shortlisted with — and it's their check, not ours. We never claim your DBS
              is valid, because we can't see it.
            </p>
          </div>
        </>
      )}

      <ErrorText state={state} />

      <div className="actions">
        <Submit>Continue</Submit>
      </div>
    </form>
  );
}

/* =========================================================================
   STEP 5 — in your own words
   ========================================================================= */

type PromptOption = { id: string; label: string; placeholder: string };

export function StepPrompt({ prompts }: { prompts: PromptOption[] }) {
  const [state, formAction] = useActionState<StepState, FormData>(savePrompt, undefined);
  const [promptId, setPromptId] = useState(prompts[0]?.id ?? "");
  const active = prompts.find((p) => p.id === promptId);

  return (
    <div>
      <h2>In your own words</h2>
      <p>One question. This is the sentence that gets someone hired.</p>

      <form action={formAction}>
        <label htmlFor="prompt_id">
          Pick a question
          <select id="prompt_id" name="prompt_id" value={promptId} onChange={(e) => setPromptId(e.target.value)}>
            {prompts.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>

        <label htmlFor="answer">
          {active?.label ?? "Your answer"}
          <textarea id="answer" name="answer" placeholder={active?.placeholder} />
        </label>

        <ErrorText state={state} />

        <div className="actions">
          <Submit>Publish my profile</Submit>
        </div>
      </form>

      <form action={skipPrompt}>
        <button type="submit" className="btn-link">Skip for now</button>
      </form>
    </div>
  );
}

/* =========================================================================
   CV upload and review
   ========================================================================= */

export function CvUpload({ onSkip }: { onSkip: () => void }) {
  const [state, formAction] = useActionState<{ error?: string } | undefined, FormData>(uploadCv, undefined);

  return (
    <div>
      <h1>Set up your profile</h1>
      <p>Upload a CV and we'll fill most of this in for you — you check it before anything is saved.</p>

      <form action={formAction}>
        <label htmlFor="cv">
          CV (PDF, Word, or a photo of a printed CV)
          <input id="cv" name="cv" type="file" accept=".pdf,.doc,.docx,image/*" required />
        </label>

        {state?.error && <p className="error">{state.error}</p>}

        <div className="actions">
          <Submit>Upload my CV</Submit>
          <button type="button" className="btn-link" onClick={onSkip}>
            I'll fill it in myself
          </button>
        </div>
      </form>
    </div>
  );
}

type CvEmployment = {
  employer?: string | null;
  job_title?: string | null;
  setting?: string | null;
  started_on?: string | null;
  ended_on?: string | null;
  is_current?: boolean;
  description?: string | null;
};

type CvDraft = {
  full_name?: string | null;
  headline?: string | null;
  profession_id?: string | null;
  postcode_district?: string | null;
  town?: string | null;
  has_driving_licence?: boolean | null;
  employment?: CvEmployment[];
  registration?: { regulator?: string; reg_number?: string } | null;
};

const SENSITIVE_LABEL: Record<string, string> = {
  date_of_birth: "date of birth",
  photo: "a photo",
  nationality: "nationality",
  marital_status: "marital status",
  ni_number: "a National Insurance number",
  health_information: "health information",
  religion: "religion",
  gender: "gender",
};

export function CvReview({
  importId,
  status: initialStatus,
  draft: initialDraft,
  sensitive: initialSensitive,
}: {
  importId: string;
  status: string;
  draft: CvDraft | null;
  sensitive: string[];
}) {
  const [status, setStatus] = useState(initialStatus);
  const [draft, setDraft] = useState(initialDraft);
  const [sensitive, setSensitive] = useState(initialSensitive);
  const [applyState, applyAction] = useActionState<{ error?: string } | undefined, FormData>(
    applyCvDraft,
    undefined
  );

  useEffect(() => {
    if (status !== "uploaded" && status !== "parsing") return;

    const id = setInterval(async () => {
      const res = await fetch(`/api/cv-status/${importId}`);
      const data: { status: string } = await res.json();
      if (data.status === "uploaded" || data.status === "parsing") return;

      const full = await getImport(importId);
      if (full) {
        setStatus(full.status);
        setDraft((full.parsed as CvDraft) ?? null);
        setSensitive(full.sensitive_found ?? []);
      } else {
        setStatus(data.status);
      }
    }, 2000);

    return () => clearInterval(id);
  }, [status, importId]);

  if (status === "uploaded" || status === "parsing") {
    return (
      <div>
        <h1>Reading your CV…</h1>
        <p>This usually takes a few seconds. You'll see a draft to check as soon as it's ready.</p>
      </div>
    );
  }

  if (status === "failed" || status === "unreadable" || !draft) {
    return (
      <div>
        <h1>We couldn't read that one</h1>
        <p>
          It happens — mostly bad phone photos. No harm done; fill the form in yourself and it'll take a
          couple of minutes.
        </p>
        <form action={discardCv}>
          <input type="hidden" name="import_id" value={importId} />
          <div className="actions">
            <button type="submit" className="btn-primary">Fill it in myself</button>
          </div>
        </form>
      </div>
    );
  }

  const employment = draft.employment ?? [];

  return (
    <div>
      <h1>Check your details</h1>
      <p>We've read your CV. Nothing here is saved until you confirm it — fix anything that's wrong first.</p>

      {sensitive.length > 0 && (
        <div className="notice">
          <strong>Worth knowing</strong>
          <p>
            Your CV mentions {sensitive.map((s) => SENSITIVE_LABEL[s] ?? s).join(", ")}. We haven't pulled
            any of that into your profile — you may want to remove it from the CV file itself too.
          </p>
        </div>
      )}

      <form action={applyAction}>
        <input type="hidden" name="import_id" value={importId} />

        <label htmlFor="headline">
          Headline
          <input id="headline" name="headline" defaultValue={draft.headline ?? ""} maxLength={120} />
        </label>

        <label htmlFor="profession_id">
          Role
          <select id="profession_id" name="profession_id" defaultValue={draft.profession_id ?? ""}>
            <option value="">Choose a role…</option>
            {PROFESSIONS.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>

        <div className="row">
          <label htmlFor="postcode_district">
            Postcode district
            <input
              id="postcode_district"
              name="postcode_district"
              defaultValue={draft.postcode_district ?? ""}
              placeholder="EN1"
            />
          </label>
          <label htmlFor="town">
            Town
            <input id="town" name="town" defaultValue={draft.town ?? ""} />
          </label>
        </div>

        <label className="check">
          <input type="checkbox" name="has_driving_licence" defaultChecked={draft.has_driving_licence ?? false} />
          I have a driving licence
        </label>

        {draft.registration?.regulator && (
          <fieldset>
            <legend>Registration</legend>
            <input type="hidden" name="regulator" value={draft.registration.regulator} />
            <label htmlFor="reg_number">
              {REGULATOR_LABEL[draft.registration.regulator] ?? draft.registration.regulator} number
              <input id="reg_number" name="reg_number" defaultValue={draft.registration.reg_number ?? ""} />
            </label>
          </fieldset>
        )}

        <fieldset>
          <legend>Employment history</legend>
          {employment.length === 0 && (
            <p className="fine">We didn't find any employment dates. Add them on the next screen.</p>
          )}
          {employment.map((job, i) => (
            <fieldset className="job" key={i}>
              <label className="check">
                <input type="checkbox" name="keep" value={i} defaultChecked />
                Keep this job
              </label>
              <div className="row">
                <label htmlFor={`employer_${i}`}>
                  Employer
                  <input id={`employer_${i}`} name={`employer_${i}`} defaultValue={job.employer ?? ""} />
                </label>
                <label htmlFor={`job_title_${i}`}>
                  Job title
                  <input id={`job_title_${i}`} name={`job_title_${i}`} defaultValue={job.job_title ?? ""} />
                </label>
              </div>
              <label htmlFor={`setting_${i}`}>
                Setting
                <select id={`setting_${i}`} name={`setting_${i}`} defaultValue={job.setting ?? ""}>
                  <option value="">Not sure / other</option>
                  {SETTINGS.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </label>
              <div className="row">
                <label htmlFor={`started_on_${i}`}>
                  Started
                  <input
                    id={`started_on_${i}`}
                    name={`started_on_${i}`}
                    type="month"
                    defaultValue={job.started_on ?? ""}
                  />
                </label>
                <label htmlFor={`ended_on_${i}`}>
                  Ended
                  <input
                    id={`ended_on_${i}`}
                    name={`ended_on_${i}`}
                    type="month"
                    defaultValue={job.ended_on ?? ""}
                    disabled={Boolean(job.is_current)}
                  />
                </label>
              </div>
              <label className="check">
                <input type="checkbox" name={`is_current_${i}`} defaultChecked={Boolean(job.is_current)} />
                Still works here
              </label>
              <label htmlFor={`description_${i}`}>
                Description
                <textarea id={`description_${i}`} name={`description_${i}`} defaultValue={job.description ?? ""} />
              </label>
            </fieldset>
          ))}
        </fieldset>

        {applyState?.error && <p className="error">{applyState.error}</p>}

        <div className="actions">
          <Submit>Looks right, continue</Submit>
        </div>
      </form>

      <form action={discardCv}>
        <input type="hidden" name="import_id" value={importId} />
        <button type="submit" className="btn-link">Start over without this CV</button>
      </form>
    </div>
  );
}
