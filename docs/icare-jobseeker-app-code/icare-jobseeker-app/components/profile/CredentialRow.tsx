import type { CredentialItem } from "@/lib/types";
import { Badge } from "./Badge";

export function CredentialRow({
  item,
  isFirst,
}: {
  item: CredentialItem;
  isFirst?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-center justify-between gap-3 py-3",
        isFirst ? "" : "border-t border-icare-line",
      ].join(" ")}
    >
      <div className="min-w-0">
        <p className="truncate text-[14.5px] font-semibold text-icare-ink">{item.title}</p>
        <p className="font-mono text-[10.5px] text-icare-mute">{item.subtitle}</p>
      </div>
      <Badge grade={item.grade} />
    </div>
  );
}
