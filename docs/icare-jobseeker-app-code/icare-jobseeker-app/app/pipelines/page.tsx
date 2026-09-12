import type { Pipeline } from "@/lib/types";
import { PipelineListItem } from "@/components/pipelines/PipelineListItem";

// Replace with a Supabase fetch keyed on the signed-in candidate.
const mockPipelines: Pipeline[] = [
  {
    id: "pl_1",
    employerName: "St Gabriel's Trust",
    roleTitle: "Band 6 Physiotherapist",
    stage: "invited_for_interview",
    stageDetail: "Thu 12 Sep · 2:00pm",
    closed: false,
  },
  {
    id: "pl_2",
    employerName: "Meadowvale Health Group",
    roleTitle: "Practice Nurse",
    stage: "shortlisted",
    stageDetail: "Accepted 3 days ago",
    closed: false,
  },
  {
    id: "pl_3",
    employerName: "Beechwood House",
    roleTitle: "Senior Care Assistant",
    stage: "pending_interview_result",
    stageDetail: "Interviewed 2 days ago",
    closed: false,
  },
  {
    id: "pl_4",
    employerName: "St Gabriel's Trust",
    roleTitle: "Healthcare Assistant",
    stage: "rejected",
    stageDetail: "St Gabriel's Trust no longer has access to your profile for this role",
    closed: true,
  },
  {
    id: "pl_5",
    employerName: "Meadowvale Health Group",
    roleTitle: "Care Coordinator",
    stage: "onboarding",
    stageDetail: "Moved to Onboarding with Meadowvale Health Group",
    closed: true,
  },
];

export default function PipelinesPage() {
  const active = mockPipelines.filter((p) => !p.closed);
  const closed = mockPipelines.filter((p) => p.closed);

  return (
    <div className="mx-auto max-w-[820px] px-4 pb-24 pt-5 sm:px-6 sm:pt-8">
      <h1 className="mb-4 font-display text-[22px] font-bold text-icare-ink">My pipelines</h1>

      <p className="mb-2 font-mono text-[10.5px] uppercase tracking-wide text-icare-mute">
        Active ({active.length})
      </p>
      <div className="mb-6 rounded-2xl border border-icare-line bg-white px-3">
        {active.map((p) => (
          <PipelineListItem key={p.id} pipeline={p} />
        ))}
      </div>

      <p className="mb-2 font-mono text-[10.5px] uppercase tracking-wide text-icare-mute">
        Closed
      </p>
      <div className="rounded-2xl border border-icare-line bg-white px-3">
        {closed.map((p) => (
          <PipelineListItem key={p.id} pipeline={p} />
        ))}
      </div>

      <p className="mt-4 font-mono text-[10.5px] leading-relaxed text-icare-mute">
        Every active pipeline carries a withdraw action in its detail view. Withdrawing revokes
        that employer's access.
      </p>
    </div>
  );
}
