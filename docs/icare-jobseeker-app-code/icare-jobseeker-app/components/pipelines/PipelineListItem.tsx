import type { Pipeline } from "@/lib/types";
import { PIPELINE_STAGE_LABEL, pipelineStageTone } from "@/lib/types";
import { Pill } from "@/components/shared/Pill";

export function PipelineListItem({ pipeline }: { pipeline: Pipeline }) {
  return (
    <div className="border-t border-icare-line px-1 py-3.5 first:border-t-0">
      <p className="text-[14.5px] font-bold text-icare-ink">{pipeline.roleTitle}</p>
      <p className="mb-2 text-[13px] text-icare-mute">{pipeline.employerName}</p>
      <Pill tone={pipelineStageTone(pipeline.stage)}>{PIPELINE_STAGE_LABEL[pipeline.stage]}</Pill>
      <p className="mt-1.5 font-mono text-[10.5px] text-icare-mute">{pipeline.stageDetail}</p>
    </div>
  );
}
