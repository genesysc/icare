import type { CredentialItem, DbsStatus } from "@/lib/types";
import { dbsStatusLabel, ALWAYS_HIDDEN_PRE_ACCEPTANCE } from "@/lib/types";
import { Badge } from "./Badge";
import { CredentialRow } from "./CredentialRow";

function SectionCard({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3.5 rounded-[18px] border border-icare-line bg-white p-[22px]">
      <div className="mb-3.5 flex items-center justify-between">
        <h2 className="font-display text-[17px] font-semibold text-icare-ink">{title}</h2>
        {onEdit && (
          <button onClick={onEdit} className="text-[12.5px] font-semibold text-icare-purple">
            Edit
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export function AboutSection({ about, onEdit }: { about: string; onEdit?: () => void }) {
  return (
    <SectionCard title="About" onEdit={onEdit}>
      <p className="text-[14.5px] leading-relaxed text-icare-ink">{about}</p>
    </SectionCard>
  );
}

export function CredentialSection({
  title,
  items,
  onEdit,
}: {
  title: string;
  items: CredentialItem[];
  onEdit?: () => void;
}) {
  return (
    <SectionCard title={title} onEdit={onEdit}>
      {items.map((item, i) => (
        <CredentialRow key={item.id} item={item} isFirst={i === 0} />
      ))}
    </SectionCard>
  );
}

export function DbsSection({ dbs, onEdit }: { dbs: DbsStatus; onEdit?: () => void }) {
  return (
    <SectionCard title="DBS" onEdit={onEdit}>
      <div className="rounded-xl bg-icare-lavender px-4 py-3.5">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-icare-teal-dark">
          Status
        </div>
        {/* Never render "Verified" or "clean" here — dbsStatusLabel is the
            only source of truth for these three permitted strings. */}
        <p className="font-display text-base font-semibold text-icare-ink">
          {dbsStatusLabel[dbs.state]}
        </p>
      </div>
    </SectionCard>
  );
}

export function HiddenFieldsSection() {
  return (
    <SectionCard title="What's hidden at this stage">
      <div className="flex flex-wrap gap-2">
        {ALWAYS_HIDDEN_PRE_ACCEPTANCE.map((field) => (
          <span
            key={field}
            className="rounded-full bg-icare-lavender px-3 py-1.5 text-[12.5px] text-icare-mute"
          >
            {field}
          </span>
        ))}
      </div>
    </SectionCard>
  );
}

export function BadgeLegendSection() {
  return (
    <SectionCard title="How to read the badges">
      <div className="flex flex-wrap gap-2">
        <Badge grade="verified" />
        <Badge grade="evidenced" />
        <Badge grade="derived" />
        <Badge grade="declared" />
      </div>
    </SectionCard>
  );
}
