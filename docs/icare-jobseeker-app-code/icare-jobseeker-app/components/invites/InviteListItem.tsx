import Link from "next/link";
import type { Invite } from "@/lib/types";

function daysUntil(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

export function InviteListItem({ invite }: { invite: Invite }) {
  const daysLeft = daysUntil(invite.expiresAt);
  return (
    <Link
      href={`/invites/${invite.id}`}
      className="block border-t border-icare-line px-1 py-3 first:border-t-0"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-icare-lavender font-display text-sm font-bold text-icare-purple">
          {invite.employerInitials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-bold text-icare-ink">{invite.roleTitle}</p>
          <p className="text-[13px] text-icare-mute">
            {invite.employerName} · {invite.location}
          </p>
          <p className="mt-1 font-mono text-[10.5px] text-icare-mute">
            Invited {new Date(invite.invitedAt).toLocaleDateString("en-GB")} · expires in {daysLeft}{" "}
            {daysLeft === 1 ? "day" : "days"}
          </p>
        </div>
      </div>
    </Link>
  );
}
