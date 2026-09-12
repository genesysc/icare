import type { ProfileData } from "@/lib/types";

interface IdentityCardProps {
  profile: ProfileData;
  previewing: boolean;
  onEdit: () => void;
  onPreview: () => void;
}

export function IdentityCard({ profile, previewing, onEdit, onPreview }: IdentityCardProps) {
  return (
    <div className="relative mb-4 overflow-hidden rounded-[20px] border border-icare-line bg-white p-6">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-16 opacity-[0.08]"
        style={{ background: "linear-gradient(120deg, #330072, #00A499)" }}
        aria-hidden
      />

      <div className="relative flex items-start gap-4 sm:items-center">
        {/* Photo — visually redacted rather than removed, so the layout the
            employer sees matches the layout the candidate sees. Removing
            the element entirely would let a redesign accidentally leak it. */}
        <div
          className={[
            "flex h-[76px] w-[76px] flex-none items-center justify-center rounded-[18px] font-display text-[28px] font-bold text-white sm:h-[92px] sm:w-[92px] sm:rounded-[22px]",
            previewing ? "bg-[repeating-linear-gradient(45deg,#EFEDF2,#EFEDF2_6px,#E4E1EA_6px,#E4E1EA_12px)]" : "",
          ].join(" ")}
          style={
            previewing
              ? undefined
              : { background: "linear-gradient(145deg, #330072, #00A499)" }
          }
        >
          {previewing ? "" : profile.initials}
        </div>

        <div className="min-w-0 flex-1">
          {previewing ? (
            <span
              className="mb-1.5 inline-block h-6 w-[170px] rounded-md bg-[#E4E1EA] sm:h-7"
              aria-label="Name hidden until invite accepted"
            />
          ) : (
            <p className="mb-0.5 font-display text-[24px] font-bold tracking-tight text-icare-ink sm:text-[28px]">
              {profile.fullName}
            </p>
          )}
          <p className="mb-2 text-[14.5px] text-icare-mute">
            {profile.roleTitle} · {profile.location}
          </p>
          <p className="flex items-center gap-1.5 font-mono text-[11px] text-icare-teal-dark">
            <span className="h-[5px] w-[5px] rounded-full bg-icare-teal" aria-hidden />
            {profile.findable ? "Findable by employers" : "Not currently findable"} · {profile.availability}
          </p>
        </div>
      </div>

      {!previewing && (
        <div className="mt-4 flex gap-2.5">
          <button
            onClick={onEdit}
            className="rounded-full bg-icare-purple px-[18px] py-2.5 text-[13.5px] font-bold text-white transition-transform active:scale-[.98]"
          >
            Edit profile
          </button>
          <button
            onClick={onPreview}
            className="rounded-full border-[1.5px] border-icare-line px-[18px] py-2.5 text-[13.5px] font-bold text-icare-purple transition-transform active:scale-[.98]"
          >
            Preview as employer
          </button>
        </div>
      )}

      {!previewing && (
        <div className="mt-3.5 flex items-start gap-2 rounded-[10px] bg-icare-lavender px-3 py-2.5 text-[12.5px] leading-relaxed text-icare-mute">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="mt-0.5 flex-none"
            aria-hidden
          >
            <path d="M3 3l18 18M10.5 10.7a2 2 0 0 0 2.8 2.8M9.5 5.5A9.4 9.4 0 0 1 12 5c5 0 8.5 4 9.5 7-.3.8-.7 1.6-1.3 2.4M6.6 6.6C4.5 8 3 10 2.5 12c1 3 4.5 7 9.5 7 1.4 0 2.7-.3 3.9-.8" />
          </svg>
          <span>
            Name, photo and contact details stay hidden from every employer until you accept
            their invite for a specific role — this is exactly what they see beforehand.
          </span>
        </div>
      )}
    </div>
  );
}
