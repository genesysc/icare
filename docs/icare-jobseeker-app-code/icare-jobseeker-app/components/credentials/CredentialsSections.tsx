"use client";

import { useState } from "react";
import type { CredentialItem, DbsStatus } from "@/lib/types";
import { dbsStatusLabel } from "@/lib/types";
import { Badge } from "@/components/profile/Badge";
import { CredentialRow } from "@/components/profile/CredentialRow";
import { EmptyState } from "@/components/shared/Pill";

export function CredentialsList({ items }: { items: CredentialItem[] }) {
  return (
    <div className="mb-3 rounded-2xl border border-icare-line bg-white p-4">
      {items.map((item, i) => (
        <CredentialRow key={item.id} item={item} isFirst={i === 0} />
      ))}
      <div className="mt-3">
        <EmptyState>+ Add training or certificate</EmptyState>
      </div>
    </div>
  );
}

export function DbsCard({ dbs }: { dbs: DbsStatus }) {
  const [hasNumber, setHasNumber] = useState(dbs.state !== "not_yet_verified");

  return (
    <div className="rounded-2xl border-[1.5px] border-icare-line bg-white p-4">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wide text-icare-teal-dark">DBS</p>

      {hasNumber ? (
        <div className="rounded-xl bg-icare-lavender px-4 py-3.5">
          <p className="font-display text-base font-semibold text-icare-ink">
            {dbsStatusLabel[dbs.state]}
          </p>
          {dbs.checkedAt && (
            <p className="mt-1 font-mono text-[10px] text-icare-mute">Checked {dbs.checkedAt}</p>
          )}
        </div>
      ) : (
        <>
          <p className="font-display text-base font-semibold text-icare-ink">
            {dbsStatusLabel.not_yet_verified}
          </p>
          <p className="my-2.5 text-[12.5px] text-icare-mute">
            Add your DBS Update Service number and we can show employers its current status.
          </p>
          <button
            onClick={() => setHasNumber(true)}
            className="w-full rounded-full border-[1.5px] border-icare-line py-2.5 text-[13px] font-bold text-icare-purple"
          >
            Add Update Service number
          </button>
        </>
      )}

      <p className="mt-3 font-mono text-[10px] leading-relaxed text-icare-mute">
        Other states: "Current — no new information" · "New information reported". iCare never
        displays "Verified" or "clean" for DBS — see dbsStatusLabel in lib/types.ts.
      </p>
    </div>
  );
}
