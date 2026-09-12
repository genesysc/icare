"use client";

import { useState } from "react";
import type { Invite } from "@/lib/types";
import { InviteListItem } from "@/components/invites/InviteListItem";
import { EmptyState } from "@/components/shared/Pill";

// Replace with a Supabase fetch keyed on the signed-in candidate.
const mockInvites: Invite[] = [
  {
    id: "inv_1",
    employerName: "St Gabriel's Trust",
    employerInitials: "SG",
    roleTitle: "Band 6 Physiotherapist",
    setting: "Acute",
    location: "Enfield",
    distanceMiles: 3.2,
    hoursPattern: "Full time, rotational",
    invitedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    status: "new",
  },
  {
    id: "inv_2",
    employerName: "Meadowvale Health Group",
    employerInitials: "MH",
    roleTitle: "Practice Nurse",
    setting: "Primary care",
    location: "Barnet",
    distanceMiles: 5.8,
    hoursPattern: "Weekdays, no weekends",
    invitedAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    expiresAt: new Date(Date.now() + 1 * 86_400_000).toISOString(),
    status: "new",
  },
];

const TABS = [
  { key: "new", label: "New" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
] as const;

export default function InvitesPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("new");
  const filtered = mockInvites.filter((i) => i.status === tab);

  return (
    <div className="mx-auto max-w-[820px] px-4 pb-24 pt-5 sm:px-6 sm:pt-8">
      <h1 className="mb-4 font-display text-[22px] font-bold text-icare-ink">Invites</h1>

      <div className="mb-3 flex border-b border-icare-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              "px-3 pb-2.5 font-mono text-[11px] uppercase tracking-wide",
              tab === t.key
                ? "border-b-2 border-icare-purple font-semibold text-icare-ink"
                : "text-icare-mute",
            ].join(" ")}
          >
            {t.label} {t.key === "new" && mockInvites.filter((i) => i.status === "new").length > 0 && `(${mockInvites.filter((i) => i.status === "new").length})`}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-icare-line bg-white px-3">
        {filtered.length > 0 ? (
          filtered.map((invite) => <InviteListItem key={invite.id} invite={invite} />)
        ) : (
          <div className="py-3">
            <EmptyState>
              {tab === "new"
                ? "No new invites. Your profile is still findable."
                : `No ${tab} invites yet.`}
            </EmptyState>
          </div>
        )}
      </div>
    </div>
  );
}
