import { describe, expect, it } from "vitest";
import { extractContacts, saveContacts, isLikelySoleTrader, type ContactStore } from "../../src/sourcing/contacts";

describe("extractContacts", () => {
  const url = "https://acmecare.co.uk/contact";
  it("finds generic business emails", () => {
    const r = extractContacts("Email us: careers@acmecare.co.uk or info@acmecare.co.uk", url);
    expect(r.map((c) => c.email).sort()).toEqual(["careers@acmecare.co.uk", "info@acmecare.co.uk"]);
    expect(r.every((c) => c.kind === "generic_email")).toBe(true);
  });
  it("skips free-provider personal addresses", () => {
    expect(extractContacts("Contact jane.smith@gmail.com or bob@hotmail.co.uk", url)).toEqual([]);
  });
  it("finds a named public HR contact with a company email", () => {
    const r = extractContacts("Jane Smith, HR Manager - jane.smith@acmecare.co.uk", url);
    expect(r).toEqual([{ kind: "named_contact", email: "jane.smith@acmecare.co.uk", name: "Jane Smith", role: "HR Manager", sourceUrl: url }]);
  });
  it("ignores a named personal address with no HR role", () => {
    expect(extractContacts("Bob Jones - bob@acmecare.co.uk", url)).toEqual([]);
  });
  it("dedupes repeated emails", () => {
    expect(extractContacts("info@a.co.uk info@a.co.uk INFO@A.CO.UK", url).length).toBe(1);
  });
});

describe("isLikelySoleTrader", () => {
  it("is false for Ltd/Limited/LLP/CIC/PLC", () => {
    for (const n of ["Acme Ltd", "Acme Care Limited", "Acme LLP", "Acme CIC", "Acme PLC"]) expect(isLikelySoleTrader(n)).toBe(false);
  });
  it("is true otherwise", () => expect(isLikelySoleTrader("J Smith Care Services")).toBe(true));
});

describe("saveContacts", () => {
  it("skips suppressed addresses and flags sole traders; never sends anything", async () => {
    const saved: any[] = [];
    const store: ContactStore = {
      suppressed: async () => new Set(["info@a.co.uk"]),
      insert: async (rows) => { saved.push(...rows); },
    };
    const n = await saveContacts(store, "c1", "J Smith Care", [
      { kind: "generic_email", email: "info@a.co.uk", sourceUrl: "u" },
      { kind: "generic_email", email: "jobs@a.co.uk", sourceUrl: "u" },
    ], "https://a.co.uk");
    expect(n).toBe(1);
    expect(saved).toEqual([{ company_id: "c1", kind: "generic_email", email: "jobs@a.co.uk", name: null, role: null, source_url: "u", website: "https://a.co.uk", sole_trader: true }]);
  });
});
