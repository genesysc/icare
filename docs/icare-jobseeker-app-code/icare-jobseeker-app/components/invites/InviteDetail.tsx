"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Invite, DeclineReasonId } from "@/lib/types";
import { DeclineFlow } from "./DeclineFlow";

export function InviteDetail({ invite }: { invite: Invite }) {
  const router = useRouter();
  const [showDecline, setShowDecline] = useState(false);

  function handleAccept() {
    // Server action: marks invite accepted, opens the pipeline, unlocks
    // identity fields to this employer scoped to invite.roleTitle only.
    router.push(`/pipelines`);
  }

  function handleSendDecline(reasonId: DeclineReasonId) {
    // Server action: records decline + reasonId, always visible to the
    // employer (per decided decline-disclosure rule — distinct from a
    // silent 7-day expiry, which notifies the employer without a reason).
    router.push(`/invites`);
  }

  if (showDecline) {
    return (
      <div className="mx-auto max-w-[560px] px-4 py-6 sm:px-6 sm:py-8">
        <DeclineFlow
          employerName={invite.employerName}
          onBack={() => setShowDecline(false)}
          onSend={handleSendDecline}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[560px] px-4 py-6 sm:px-6 sm:py-8">
      <button onClick={() => router.push("/invites")} className="mb-4 font-mono text-[11px] text-icare-mute">
        ← Invites
      </button>

      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-icare-lavender font-display text-sm font-bold text-icare-purple">
          {invite.employerInitials}
        </div>
        <div>
          <p className="font-display text-base font-bold text-icare-ink">{invite.employerName}</p>
          <p className="font-mono text-[10.5px] text-icare-mute">
            {invite.setting} · {invite.location} · {invite.distanceMiles} mi
          </p>
        </div>
      </div>

      <h1 className="mb-4 font-display text-[19px] font-semibold text-icare-ink">
        {invite.roleTitle}
      </h1>

      <div className="mb-3 rounded-xl border border-icare-line bg-white p-4">
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-icare-teal-dark">
          Hours &amp; pattern
        </p>
        <p className="text-[14px] text-icare-ink">{invite.hoursPattern}</p>
      </div>

      <div className="mb-5 rounded-xl border-[1.5px] border-icare-purple bg-white p-4">
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-icare-purple">
          If you accept
        </p>
        <p className="mb-1.5 text-[13px] text-icare-ink">
          {invite.employerName} will see your name, photo and contact details{" "}
          <strong>for this role only</strong>.
        </p>
        <p className="text-[13px] text-icare-ink">
          Their access ends if the role closes, you withdraw, or you're not taken forward.
        </p>
      </div>

      <button
        onClick={handleAccept}
        className="mb-2.5 w-full rounded-full bg-icare-purple py-3.5 text-[15px] font-bold text-white"
      >
        Accept invite
      </button>
      <div className="flex gap-2.5">
        <button
          onClick={() => setShowDecline(true)}
          className="flex-1 rounded-full border-[1.5px] border-icare-line py-3 text-[13.5px] font-bold text-icare-purple"
        >
          Decline
        </button>
        <button
          onClick={() => router.push("/invites")}
          className="flex-1 rounded-full border-[1.5px] border-icare-line py-3 text-[13.5px] font-bold text-icare-purple"
        >
          Decide later
        </button>
      </div>

      <p className="mt-3 font-mono text-[10.5px] text-icare-mute">
        Declining doesn't hide you from this employer's future searches — it closes this role only.
      </p>
    </div>
  );
}
