"use client";

import { useState } from "react";
import type { ProfileData } from "@/lib/types";
import { IdentityCard } from "./IdentityCard";
import { PreviewToggle } from "./PreviewToggle";
import {
  AboutSection,
  CredentialSection,
  DbsSection,
  HiddenFieldsSection,
  BadgeLegendSection,
} from "./ProfileSections";

// Experience credentials carry the current employer's name, which is one of
// the always-hidden-pre-acceptance fields (see lib/types). We redact it here
// at render time rather than fetching a pre-redacted payload, so this one
// component is the single place that decision has to be correct.
function redactEmployerName(
  items: ProfileData["experience"],
  employerName: string,
  previewing: boolean
) {
  if (!previewing) return items;
  return items.map((item) => ({
    ...item,
    subtitle: item.subtitle.includes(employerName)
      ? item.subtitle.replace(employerName, "Employer name hidden")
      : item.subtitle,
    title: item.title === employerName ? "Employer name hidden" : item.title,
  }));
}

export function ProfileView({ profile }: { profile: ProfileData }) {
  const [previewing, setPreviewing] = useState(false);

  const experience = redactEmployerName(profile.experience, profile.currentEmployerName, previewing);

  return (
    <div className="mx-auto max-w-[820px] px-4 pb-24 pt-5 sm:px-6 sm:pt-8">
      <PreviewToggle previewing={previewing} onToggle={() => setPreviewing((v) => !v)} />

      <IdentityCard
        profile={profile}
        previewing={previewing}
        onEdit={() => {
          /* navigate to /profile/edit */
        }}
        onPreview={() => setPreviewing(true)}
      />

      <AboutSection about={profile.about} onEdit={previewing ? undefined : () => {}} />

      <div className="sm:grid sm:grid-cols-2 sm:gap-3.5">
        <CredentialSection
          title="Registrations & training"
          items={profile.registrationsAndTraining}
          onEdit={previewing ? undefined : () => {}}
        />
        <CredentialSection
          title="Experience"
          items={experience}
          onEdit={previewing ? undefined : () => {}}
        />
      </div>

      <DbsSection dbs={profile.dbs} onEdit={previewing ? undefined : () => {}} />

      {previewing && <HiddenFieldsSection />}

      <BadgeLegendSection />
    </div>
  );
}
