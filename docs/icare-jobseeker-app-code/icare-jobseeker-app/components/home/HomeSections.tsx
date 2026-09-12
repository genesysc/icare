import Link from "next/link";
import type { Invite } from "@/lib/types";

export function InvitesStrip({ invites }: { invites: Invite[] }) {
  if (invites.length === 0) return null;
  return (
    <Link
      href="/invites"
      className="mb-4 block rounded-2xl border-[1.5px] border-icare-purple bg-white p-4"
    >
      <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-icare-purple">
        {invites.length} new {invites.length === 1 ? "invite" : "invites"}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {invites.map((invite) => (
          <div key={invite.id} className="rounded-xl bg-icare-lavender px-3 py-2.5">
            <p className="text-[13px] font-semibold text-icare-ink">{invite.roleTitle}</p>
            <p className="font-mono text-[10px] text-icare-mute">{invite.employerName}</p>
          </div>
        ))}
      </div>
    </Link>
  );
}

export function FeedPostCard({
  authorName,
  authorRole,
  timeAgo,
  body,
}: {
  authorName: string;
  authorRole: string;
  timeAgo: string;
  body: string;
}) {
  return (
    <div className="mb-3 rounded-2xl border border-icare-line bg-white p-4">
      <div className="mb-2.5 flex items-center gap-3">
        <div className="h-9 w-9 flex-none rounded-full bg-icare-lavender" />
        <div>
          <p className="text-[13.5px] font-semibold text-icare-ink">{authorName}</p>
          <p className="font-mono text-[10px] text-icare-mute">
            {authorRole} · {timeAgo}
          </p>
        </div>
      </div>
      <p className="text-[14px] leading-relaxed text-icare-ink">{body}</p>
    </div>
  );
}

export function ProfileStrengthCard({ percent }: { percent: number }) {
  return (
    <div className="mb-3 rounded-2xl border border-icare-line bg-white p-4">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-icare-mute">
        Profile strength
      </p>
      <div className="mb-2 h-1.5 w-full rounded-full bg-icare-lavender">
        <div
          className="h-1.5 rounded-full bg-icare-purple"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mb-3 text-[12.5px] text-icare-mute">
        Add your registration to strengthen your profile.
      </p>
      <Link
        href="/profile/edit"
        className="block rounded-full border-[1.5px] border-icare-line py-2 text-center text-[12.5px] font-bold text-icare-purple"
      >
        Complete profile
      </Link>
    </div>
  );
}

export function VisibilitySummaryCard({
  findable,
  nameHidden,
}: {
  findable: boolean;
  nameHidden: boolean;
}) {
  return (
    <div className="rounded-2xl border border-icare-line bg-white p-4">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-icare-mute">
        Your visibility
      </p>
      <p className="mb-3 text-[12.5px] text-icare-ink">
        {findable ? "Findable by employers" : "Not currently findable"} ·{" "}
        {nameHidden ? "Name hidden" : "Name visible"}
      </p>
      <Link href="/settings/visibility" className="font-mono text-[11px] text-icare-purple">
        Change
      </Link>
    </div>
  );
}
