import type { NetworkPerson, NetworkOrg } from "@/lib/types";
import { SearchBar, PersonRow, OrgRow } from "@/components/network/NetworkSections";

// NOTE: this whole route was flagged in wireframe review as the piece
// most likely to be phase 2. It's built to the same standard as the rest
// so it can ship or be cut without half-finished code either way — cutting
// it just means removing this route and its tab-bar entry.

const mockPeople: NetworkPerson[] = [
  { id: "p1", name: "Physiotherapist", roleTitle: "Physiotherapist", location: "Enfield" },
  { id: "p2", name: "Practice Manager", roleTitle: "Practice Manager", location: "Barnet" },
];

const mockOrgs: NetworkOrg[] = [{ id: "o1", name: "Beechwood House", kind: "Organisation" }];

export default function NetworkPage() {
  return (
    <div className="mx-auto max-w-[820px] px-4 pb-24 pt-5 sm:px-6 sm:pt-8">
      <h1 className="mb-4 font-display text-[22px] font-bold text-icare-ink">Network</h1>
      <SearchBar />
      <div className="rounded-2xl border border-icare-line bg-white px-3">
        {mockPeople.map((p) => (
          <PersonRow key={p.id} person={p} />
        ))}
        {mockOrgs.map((o) => (
          <OrgRow key={o.id} org={o} />
        ))}
      </div>
    </div>
  );
}
