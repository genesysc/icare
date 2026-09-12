import type { CredentialItem, DbsStatus } from "@/lib/types";
import { CredentialsList, DbsCard } from "@/components/credentials/CredentialsSections";

const mockCredentials: CredentialItem[] = [
  { id: "nmc", title: "NMC registration", subtitle: "Checked 12 Aug 2026", grade: "verified" },
  { id: "degree", title: "BSc (Hons) Adult Nursing", subtitle: "Certificate uploaded", grade: "evidenced" },
  { id: "als", title: "ALS provider", subtitle: "Refreshed 2026, declared", grade: "declared" },
];

const mockDbs: DbsStatus = { state: "not_yet_verified" };

export default function CredentialsPage() {
  return (
    <div className="mx-auto max-w-[820px] px-4 pb-24 pt-5 sm:px-6 sm:pt-8">
      <h1 className="mb-4 font-display text-[22px] font-bold text-icare-ink">Credentials</h1>
      <CredentialsList items={mockCredentials} />
      <DbsCard dbs={mockDbs} />
    </div>
  );
}
