"use client";

import { useState } from "react";
import type { VisibilityField, VisibilityLevel } from "@/lib/types";
import {
  MasterSwitch,
  FieldVisibilityRow,
  AlwaysHiddenNote,
} from "@/components/settings/VisibilitySections";

const initialFields: VisibilityField[] = [
  { key: "about", label: "About you", level: "public" },
  { key: "experience", label: "Experience", level: "public" },
  { key: "registrations", label: "Registrations", level: "employers_only" },
  { key: "availability", label: "Availability", level: "employers_only" },
  { key: "current_employer", label: "Current employer", level: "private" },
  { key: "documents", label: "Documents", level: "private" },
];

export default function VisibilitySettingsPage() {
  const [findable, setFindable] = useState(true);
  const [fields, setFields] = useState(initialFields);

  function updateField(key: string, level: VisibilityLevel) {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, level } : f)));
  }

  return (
    <div className="mx-auto max-w-[560px] px-4 pb-24 pt-5 sm:px-6 sm:pt-8">
      <h1 className="mb-4 font-display text-[22px] font-bold text-icare-ink">Visibility</h1>

      <MasterSwitch on={findable} onToggle={() => setFindable((v) => !v)} />

      <p className="mb-2 font-mono text-[10.5px] uppercase tracking-wide text-icare-mute">
        Field by field
      </p>
      <div className="rounded-2xl border border-icare-line bg-white">
        {fields.map((f) => (
          <FieldVisibilityRow
            key={f.key}
            label={f.label}
            level={f.level}
            onChange={(level) => updateField(f.key, level)}
          />
        ))}
      </div>

      <AlwaysHiddenNote />

      {/* Open question carried from wireframe review: does "Public" mean
          other iCare members, or the open indexed web? Needs defining
          before this label ships — see notes on screen 08. Blocking is
          also absent here and was flagged as a likely gap. */}
    </div>
  );
}
