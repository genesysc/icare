import type { NetworkPerson, NetworkOrg } from "@/lib/types";

export function SearchBar() {
  return (
    <div className="mb-3 rounded-xl border border-dashed border-icare-line px-4 py-3 font-mono text-[11px] text-icare-mute">
      Search people, organisations, specialties
    </div>
  );
}

export function PersonRow({ person }: { person: NetworkPerson }) {
  return (
    <div className="flex items-center gap-3 border-t border-icare-line px-1 py-3 first:border-t-0">
      <div className="h-9 w-9 flex-none rounded-full bg-icare-lavender" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-icare-ink">{person.name}</p>
        <p className="font-mono text-[10px] text-icare-mute">
          {person.roleTitle} · {person.location}
        </p>
      </div>
      <button className="rounded-full border-[1.5px] border-icare-line px-3 py-1.5 text-[11.5px] font-bold text-icare-purple">
        Connect
      </button>
    </div>
  );
}

export function OrgRow({ org }: { org: NetworkOrg }) {
  return (
    <div className="flex items-center gap-3 border-t border-icare-line px-1 py-3 first:border-t-0">
      <div className="h-9 w-9 flex-none rounded-xl bg-icare-lavender" />
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-icare-ink">{org.name}</p>
        <p className="font-mono text-[10px] text-icare-mute">{org.kind}</p>
      </div>
      <button className="rounded-full border-[1.5px] border-icare-line px-3 py-1.5 text-[11.5px] font-bold text-icare-purple">
        Follow
      </button>
    </div>
  );
}
