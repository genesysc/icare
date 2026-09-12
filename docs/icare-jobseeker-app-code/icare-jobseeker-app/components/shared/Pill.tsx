export function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "progress" | "positive";
}) {
  const toneClasses = {
    neutral: "bg-icare-lavender text-icare-mute",
    progress: "bg-badge-evidenced-bg text-badge-evidenced-fg",
    positive: "bg-badge-verified-bg text-badge-verified-fg",
  }[tone];

  return (
    <span
      className={[
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1",
        "font-mono text-[10px] font-semibold uppercase tracking-wider",
        toneClasses,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-icare-line bg-[repeating-linear-gradient(45deg,#F4F3F7,#F4F3F7_6px,#EBE9F0_6px,#EBE9F0_12px)] px-4 py-5 text-center font-mono text-[11px] text-icare-mute">
      {children}
    </div>
  );
}
