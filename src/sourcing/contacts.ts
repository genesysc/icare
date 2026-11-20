// Saves public business contacts for LATER outreach. This module never sends email.
export interface Contact { kind: "generic_email" | "named_contact"; email: string; name?: string; role?: string; sourceUrl: string }

const FREE = /@(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|aol|btinternet|sky|talktalk|protonmail)\./i;
const GENERIC = /^(info|hello|hi|enquiries|enquiry|contact|careers|career|jobs|recruitment|recruit|hr|people|admin|office|team|support|reception|apply|vacancies|work)$/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const ROLE = /(HR Manager|HR Advisor|HR Business Partner|HR Director|Head of HR|Human Resources[A-Za-z ]*|Recruitment (?:Manager|Lead|Coordinator|Officer|Advisor)|People (?:Manager|Partner|Director)|Talent (?:Acquisition )?(?:Manager|Partner|Lead))/i;

export function extractContacts(text: string, sourceUrl: string): Contact[] {
  const out: Contact[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(EMAIL)) {
    const email = m[0].replace(/[.,;]+$/, "").toLowerCase();
    if (seen.has(email) || FREE.test(email)) continue;
    const local = email.split("@")[0];
    if (GENERIC.test(local)) { seen.add(email); out.push({ kind: "generic_email", email, sourceUrl }); continue; }
    const before = text.slice(Math.max(0, (m.index ?? 0) - 120), m.index ?? 0);
    const nm = before.match(/([A-Z][a-z]+(?:\s[A-Z][a-z'-]+)+)\s*[,–—-]\s*([^,–—\n-]*?)\s*[-–—:|]*\s*$/);
    if (nm && ROLE.test(nm[2])) {
      seen.add(email);
      out.push({ kind: "named_contact", email, name: nm[1], role: nm[2].match(ROLE)![0], sourceUrl });
    }
  }
  return out;
}

export function isLikelySoleTrader(name: string): boolean {
  return !/\b(ltd|limited|llp|plc|cic|lp|inc)\b\.?/i.test(name);
}

export interface ContactStore {
  suppressed(): Promise<Set<string>>;
  insert(rows: Record<string, unknown>[]): Promise<void>;
}

export async function saveContacts(store: ContactStore, companyId: string, companyName: string, contacts: Contact[], website: string | null = null): Promise<number> {
  const suppressed = await store.suppressed();
  const sole = isLikelySoleTrader(companyName);
  const rows = contacts
    .filter((c) => !suppressed.has(c.email.toLowerCase()))
    .map((c) => ({ company_id: companyId, kind: c.kind, email: c.email, name: c.name ?? null, role: c.role ?? null, source_url: c.sourceUrl, website, sole_trader: sole }));
  if (rows.length) await store.insert(rows);
  return rows.length;
}
