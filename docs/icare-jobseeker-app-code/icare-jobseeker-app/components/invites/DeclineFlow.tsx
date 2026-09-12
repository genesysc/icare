"use client";

import { useState } from "react";
import { DECLINE_REASONS, type DeclineReasonId } from "@/lib/types";

interface DeclineFlowProps {
  employerName: string;
  onBack: () => void;
  onSend: (reasonId: DeclineReasonId) => void;
}

export function DeclineFlow({ employerName, onBack, onSend }: DeclineFlowProps) {
  const [selected, setSelected] = useState<DeclineReasonId | null>(null);

  return (
    <div>
      <button onClick={onBack} className="mb-4 font-mono text-[11px] text-icare-mute">
        ← Back
      </button>

      <p className="mb-1 font-display text-lg font-semibold text-icare-ink">
        Why isn't this the right fit?
      </p>
      <p className="mb-4 text-[13.5px] text-icare-mute">
        This is shared with {employerName}. Pick whichever is closest.
      </p>

      <div className="mb-5 space-y-2">
        {DECLINE_REASONS.map((reason) => {
          const active = selected === reason.id;
          return (
            <button
              key={reason.id}
              onClick={() => setSelected(reason.id)}
              className={[
                "flex w-full items-center justify-between rounded-xl border bg-white px-4 py-3 text-left text-[14px] transition-colors",
                active ? "border-icare-purple border-[1.5px]" : "border-icare-line",
              ].join(" ")}
            >
              <span>{reason.label}</span>
              <span
                className={[
                  "h-4 w-4 flex-none rounded-full border",
                  active ? "border-icare-purple bg-icare-purple" : "border-icare-line",
                ].join(" ")}
                aria-hidden
              />
            </button>
          );
        })}
      </div>

      <button
        disabled={!selected}
        onClick={() => selected && onSend(selected)}
        className="w-full rounded-full bg-icare-purple py-3.5 text-[15px] font-bold text-white disabled:opacity-40"
      >
        Send decline
      </button>

      <p className="mt-3 font-mono text-[10.5px] leading-relaxed text-icare-mute">
        A reason is always sent — "Prefer not to say" is a valid, complete answer. There's no
        option to decline with nothing shared.
      </p>
    </div>
  );
}
