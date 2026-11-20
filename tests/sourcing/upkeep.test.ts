import { describe, expect, it } from "vitest";
import { runUpkeep, type UpkeepStore } from "../../src/sourcing/upkeep";
import type { Job } from "../../src/sourcing/rules";

const now = new Date("2026-12-01T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();
const J = (title: string): Job => ({ title, location: "Leeds", payText: "£13/hr", hoursText: null, applyUrl: "https://a.co/1", description: "" });

function setup(jobs: { id: string; title: string; location: string; last_seen_at: string }[], extract: () => Promise<Job[]>) {
  const touched: string[] = [];
  const closed: string[] = [];
  const store: UpkeepStore = {
    expiryDays: async () => 30,
    companiesWithOpenJobs: async () => [{ id: "c1", careers_url: "https://a.co/careers" }],
    openJobs: async () => jobs,
    touch: async (ids) => { touched.push(...ids); },
    close: async (ids) => { closed.push(...ids); },
  };
  return { store, touched, closed, run: () => runUpkeep(store, { extractVacancies: extract }, now) };
}

describe("runUpkeep", () => {
  it("touches jobs still on the page", async () => {
    const t = setup([{ id: "j1", title: "Support Worker", location: "Leeds", last_seen_at: daysAgo(3) }], async () => [J("Support Worker")]);
    const r = await t.run();
    expect(t.touched).toEqual(["j1"]);
    expect(r.rechecked).toBe(1);
  });
  it("keeps a missing job until it has been unseen for the expiry window", async () => {
    const t = setup([{ id: "j1", title: "Cook", location: "Leeds", last_seen_at: daysAgo(10) }], async () => [J("Support Worker")]);
    await t.run();
    expect(t.closed).toEqual([]);
  });
  it("closes a missing job unseen for more than 30 days", async () => {
    const t = setup([{ id: "j1", title: "Cook", location: "Leeds", last_seen_at: daysAgo(31) }], async () => [J("Support Worker")]);
    const r = await t.run();
    expect(t.closed).toEqual(["j1"]);
    expect(r.expired).toBe(1);
  });
  it("closes nothing when the page returns no vacancies (could be a blocked or changed site)", async () => {
    const t = setup([{ id: "j1", title: "Cook", location: "Leeds", last_seen_at: daysAgo(60) }], async () => []);
    await t.run();
    expect(t.closed).toEqual([]);
  });
  it("closes nothing when the page fails to load", async () => {
    const t = setup([{ id: "j1", title: "Cook", location: "Leeds", last_seen_at: daysAgo(60) }], async () => { throw new Error("boom"); });
    await t.run();
    expect(t.closed).toEqual([]);
  });
});
