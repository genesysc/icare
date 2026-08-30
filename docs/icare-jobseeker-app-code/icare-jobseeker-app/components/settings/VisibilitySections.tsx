"use client";

import type { VisibilityLevel } from "@/lib/types";
import { ALWAYS_HIDDEN_PRE_ACCEPTANCE } from "@/lib/types";

const LEVEL_LABEL: Record<VisibilityLevel, string> = {
  public: "Public",
  employers_only: "Employers only",
  private: "Private",
};

const LEVELS: VisibilityLevel[] = ["public", "employers_only", "private"];

export function MasterSwitch({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mb-4 rounded-2xl border-[1.5px] border-icare-purple bg-white p-4">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-icare-purple">
        Master switch
      </p>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[14.5px] font-semibold text-icare-ink">Findable by employers</p>
          <p className="text-[12.5px] text-icare-mute">{on ? "On" : "Off"}</p>
        </div>
        <button
          role="switch"
          aria-checked={on}
          onClick={onToggle}
          className={[
            "relative h-[26px] w-[46px] flex-none rounded-full transition-colors",
            on ? "bg-icare-purple" : "bg-icare-line",
          ].join(" ")}
        >
          <span
            className={[
              "absolute left-[3px] top-[3px] h-5 w-5 rounded-full bg-white transition-transform",
              on ? "translate-x-5" : "translate-x-0",
            ].join(" ")}
          />
        </button>
      </div>
      <p className="mt-3 font-mono text-[10px] text-icare-mute">
        Turning this off removes you from search. Active pipelines continue.
      </p>
    </div>
  );
}

export function FieldVisibilityRow({
  label,
  level,
  onChange,
}: {
  label: string;
  level: VisibilityLevel;
  onChange: (level: VisibilityLevel) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-icare-line px-4 py-3 first:border-t-0">
      <span className="text-[14px] text-icare-ink">{label}</span>
      <select
        value={level}
        onChange={(e) => onChange(e.target.value as VisibilityLevel)}
        className="rounded-full border border-icare-line bg-white px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-wide text-icare-mute"
      >
        {LEVELS.map((l) => (
          <option key={l} value={l}>
            {LEVEL_LABEL[l]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AlwaysHiddenNote() {
  return (
    <div className="mt-3 rounded-xl bg-icare-lavender p-4">
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-icare-mute">
        Always hidden until you accept an invite
      </p>
      <p className="text-[12.5px] text-icare-ink">
        {ALWAYS_HIDDEN_PRE_ACCEPTANCE.join(" · ")}
      </p>
      <p className="mt-2 font-mono text-[10px] text-icare-mute">
        These fields are not user-configurable — they protect the consent model itself.
      </p>
    </div>
  );
}
