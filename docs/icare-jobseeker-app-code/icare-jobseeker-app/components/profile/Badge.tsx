import type { BadgeGrade } from "@/lib/types";

const GRADE_LABEL: Record<BadgeGrade, string> = {
  verified: "Verified",
  evidenced: "Evidenced",
  derived: "Derived",
  declared: "Declared",
};

const GRADE_CLASSES: Record<BadgeGrade, string> = {
  verified: "bg-badge-verified-bg text-badge-verified-fg",
  evidenced: "bg-badge-evidenced-bg text-badge-evidenced-fg",
  derived: "bg-badge-derived-bg text-badge-derived-fg",
  declared: "bg-white text-badge-declared-fg border border-icare-line",
};

export function Badge({ grade }: { grade: BadgeGrade }) {
  return (
    <span
      className={[
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1",
        "font-mono text-[10px] font-semibold uppercase tracking-wider",
        GRADE_CLASSES[grade],
      ].join(" ")}
    >
      {GRADE_LABEL[grade]}
    </span>
  );
}
