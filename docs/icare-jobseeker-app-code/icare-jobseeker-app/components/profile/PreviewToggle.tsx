interface PreviewToggleProps {
  previewing: boolean;
  onToggle: () => void;
  employerName?: string; // shown in the "employer view" label when known
}

export function PreviewToggle({ previewing, onToggle, employerName }: PreviewToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        "mb-4 flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors",
        previewing ? "bg-icare-ink text-white" : "border border-icare-line bg-white text-icare-ink",
      ].join(" ")}
    >
      <span className="flex items-center gap-2.5">
        <span
          className={[
            "h-2 w-2 flex-none rounded-full",
            previewing ? "bg-icare-teal" : "bg-icare-line",
          ].join(" ")}
          aria-hidden
        />
        <span>
          <span className="block text-[13.5px] font-semibold">
            {previewing ? "Employer view" : "Your view"}
          </span>
          <span
            className={[
              "mt-0.5 block font-mono text-[10.5px]",
              previewing ? "text-white/55" : "text-icare-mute",
            ].join(" ")}
          >
            {previewing
              ? `What ${employerName ?? "an employer"} sees before you accept an invite`
              : "This is what you see when you edit your profile"}
          </span>
        </span>
      </span>

      <span
        role="switch"
        aria-checked={previewing}
        aria-label="Toggle employer preview"
        className={[
          "relative h-[26px] w-[46px] flex-none rounded-full transition-colors",
          previewing ? "bg-icare-teal" : "bg-icare-line",
        ].join(" ")}
      >
        <span
          className={[
            "absolute left-[3px] top-[3px] h-5 w-5 rounded-full bg-white transition-transform",
            previewing ? "translate-x-5" : "translate-x-0",
          ].join(" ")}
        />
      </span>
    </button>
  );
}
