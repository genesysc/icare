import { describe, expect, it } from "vitest";
import { createClient, findWebsite, findCareersUrl, extractVacancies, CostCapExceeded } from "../../src/sourcing/firecrawl";

function mock(responses: unknown[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const body = responses.shift();
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

describe("default fetch", () => {
  it("calls the global fetch without binding it to the client (Workers throw 'Illegal invocation' otherwise)", async () => {
    const real = globalThis.fetch;
    let seenThis: unknown = "unset";
    globalThis.fetch = (function (this: unknown) {
      seenThis = this;
      return Promise.resolve(new Response(JSON.stringify({ success: true, data: { web: [] } })));
    }) as unknown as typeof fetch;
    try {
      const c = createClient({ apiKey: "k", costCap: 5 });
      await findWebsite(c, "Acme");
      expect(seenThis === undefined || seenThis === globalThis).toBe(true);
    } finally {
      globalThis.fetch = real;
    }
  });
});

describe("firecrawl wrapper", () => {
  it("findWebsite skips job boards and directories, sends the key", async () => {
    const m = mock([{ success: true, data: { web: [
      { url: "https://uk.indeed.com/cmp/acme" },
      { url: "https://www.linkedin.com/company/acme" },
      { url: "https://www.acmecare.co.uk/about" },
    ] } }]);
    const c = createClient({ apiKey: "k", fetchFn: m.fetchFn, costCap: 5 });
    expect(await findWebsite(c, "Acme Care Ltd")).toBe("https://www.acmecare.co.uk");
    expect((m.calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer k");
  });
  it("findWebsite returns null when nothing usable", async () => {
    const m = mock([{ success: true, data: { web: [{ url: "https://facebook.com/acme" }] } }]);
    const c = createClient({ apiKey: "k", fetchFn: m.fetchFn, costCap: 5 });
    expect(await findWebsite(c, "Acme")).toBeNull();
  });
  it("findCareersUrl prefers a same-site careers link", async () => {
    const m = mock([{ success: true, data: { web: [
      { url: "https://other.com/careers" },
      { url: "https://www.acmecare.co.uk/about" },
      { url: "https://www.acmecare.co.uk/careers/" },
    ] } }]);
    const c = createClient({ apiKey: "k", fetchFn: m.fetchFn, costCap: 5 });
    expect(await findCareersUrl(c, "https://www.acmecare.co.uk")).toBe("https://www.acmecare.co.uk/careers/");
  });
  it("extractVacancies maps the extracted JSON and drops rows without a title", async () => {
    const m = mock([{ success: true, data: { json: { jobs: [
      { title: "Support Worker", location: "Leeds", pay: "£13 per hour", hours: "37.5 hours", apply_url: "https://a.co/1", description: "d" },
      { title: "", location: "x" },
    ] } } }]);
    const c = createClient({ apiKey: "k", fetchFn: m.fetchFn, costCap: 5 });
    const jobs = await extractVacancies(c, "https://a.co/careers");
    expect(jobs).toEqual([{ title: "Support Worker", location: "Leeds", payText: "£13 per hour", hoursText: "37.5 hours", applyUrl: "https://a.co/1", description: "d" }]);
  });
  it("throws CostCapExceeded before spending past the cap", async () => {
    const m = mock([{ success: true, data: { web: [] } }, { success: true, data: { web: [] } }]);
    const c = createClient({ apiKey: "k", fetchFn: m.fetchFn, costCap: 1.5 });
    await findWebsite(c, "A");
    await expect(findWebsite(c, "B")).rejects.toBeInstanceOf(CostCapExceeded);
    expect(m.calls.length).toBe(1);
  });
});
