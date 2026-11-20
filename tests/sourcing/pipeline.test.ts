import { describe, expect, it } from "vitest";
import { createBatch, processCompany, runBatch, type Store, type Deps } from "../../src/sourcing/pipeline";
import { CostCapExceeded } from "../../src/sourcing/firecrawl";
import { normaliseName } from "../../src/sourcing/names";
import type { Job } from "../../src/sourcing/rules";

function fakeStore(over: Partial<Store> = {}) {
  const companies = new Map<string, any>();
  const published: any[] = [];
  const rejected: any[] = [];
  const store: Store = {
    settings: async () => ({ minHourlyPay: 12.83, defaultWeeklyHours: 37.5, dailyPublishCap: 50 }),
    upsertCompany: async (name) => {
      const key = normaliseName(name);
      let c = [...companies.values()].find((x) => x.key === key);
      if (!c) { c = { id: `c${companies.size + 1}`, key, name, status: "queued" }; companies.set(c.id, c); }
      return c.id;
    },
    getCompany: async (id) => companies.get(id),
    updateCompany: async (id, patch) => { Object.assign(companies.get(id), patch); },
    publishedToday: async () => published.length,
    registerMatched: async () => true,
    existingKeys: async () => new Set<string>(),
    publish: async (_c, job, verdict) => { published.push({ job, verdict }); return { published: true }; },
    reject: async (_c, job, reasons) => { rejected.push({ job, reasons }); },
    ...over,
  };
  return { store, companies, published, rejected };
}

const J = (o: Partial<Job> = {}): Job => ({ title: "Support Worker", location: "Leeds", payText: "£13 per hour", hoursText: null, applyUrl: "https://a.co/1", description: "", ...o });
const deps = (o: Partial<Deps> = {}): Deps => ({
  findWebsite: async () => "https://a.co", findCareersUrl: async () => "https://a.co/careers",
  extractVacancies: async () => [J()], ...o,
});

describe("createBatch", () => {
  it("does not duplicate Acme Ltd / Acme Limited / the same name pasted twice", async () => {
    const { store, companies } = fakeStore();
    const ids = await createBatch(store, ["Acme Ltd", "Acme Limited", "Acme Ltd", "  ", "Beta Care Ltd"]);
    expect(ids.length).toBe(2);
    expect(companies.size).toBe(2);
  });
});

describe("processCompany", () => {
  it("no website", async () => {
    const { store, companies } = fakeStore();
    const [id] = await createBatch(store, ["Acme Ltd"]);
    await processCompany(store, deps({ findWebsite: async () => null }), id);
    expect(companies.get(id).status).toBe("no_website");
  });
  it("no careers page", async () => {
    const { store, companies } = fakeStore();
    const [id] = await createBatch(store, ["Acme Ltd"]);
    await processCompany(store, deps({ findCareersUrl: async () => null }), id);
    expect(companies.get(id).status).toBe("no_careers_page");
  });
  it("no vacancies", async () => {
    const { store, companies } = fakeStore();
    const [id] = await createBatch(store, ["Acme Ltd"]);
    await processCompany(store, deps({ extractVacancies: async () => [] }), id);
    expect(companies.get(id).status).toBe("no_vacancies");
  });
  it("publishes passing jobs and rejects failing ones with reasons", async () => {
    const { store, published, rejected, companies } = fakeStore();
    const [id] = await createBatch(store, ["Acme Ltd"]);
    await processCompany(store, deps({ extractVacancies: async () => [J(), J({ title: "Cook", payText: "£11 per hour" })] }), id);
    expect(published.length).toBe(1);
    expect(rejected[0].reasons).toContain("below_minimum");
    expect(companies.get(id).status).toBe("done");
  });
  it("never publishes without a register match", async () => {
    const { store, published, rejected } = fakeStore({ registerMatched: async () => false });
    const [id] = await createBatch(store, ["Acme Ltd"]);
    await processCompany(store, deps(), id);
    expect(published.length).toBe(0);
    expect(rejected[0].reasons).toContain("no_register_match");
  });
  it("the same job twice in one page publishes once", async () => {
    const { store, published, rejected } = fakeStore();
    const [id] = await createBatch(store, ["Acme Ltd"]);
    await processCompany(store, deps({ extractVacancies: async () => [J(), J()] }), id);
    expect(published.length).toBe(1);
    expect(rejected[0].reasons).toContain("duplicate");
  });
  it("re-running does not re-publish an existing job", async () => {
    const { store, published } = fakeStore({ existingKeys: async () => new Set(["support worker|leeds"]) });
    const [id] = await createBatch(store, ["Acme Ltd"]);
    await processCompany(store, deps(), id);
    expect(published.length).toBe(0);
  });
});

describe("runBatch", () => {
  it("stops at the daily publish cap and flags needs_a_look", async () => {
    const { store, published, rejected, companies } = fakeStore({
      settings: async () => ({ minHourlyPay: 12.83, defaultWeeklyHours: 37.5, dailyPublishCap: 1 }),
    });
    const ids = await createBatch(store, ["Acme Ltd"]);
    await runBatch(store, deps({ extractVacancies: async () => [J(), J({ title: "Care Coordinator", location: "York" })] }), ids);
    expect(published.length).toBe(1);
    expect(rejected[0].reasons).toContain("daily_cap");
    expect(companies.get(ids[0]).status).toBe("needs_a_look");
  });
  it("a cost-cap error stops the batch and marks the company needs_a_look", async () => {
    const { store, companies } = fakeStore();
    const ids = await createBatch(store, ["Acme Ltd", "Beta Ltd"]);
    const r = await runBatch(store, deps({ findWebsite: async () => { throw new CostCapExceeded(5, 5); } }), ids);
    expect(r.stoppedForCost).toBe(true);
    expect(companies.get(ids[0]).status).toBe("needs_a_look");
    expect(companies.get(ids[1]).status).toBe("queued");
  });
});
