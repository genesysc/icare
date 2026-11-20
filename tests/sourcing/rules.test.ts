import { describe, expect, it } from "vitest";
import { evaluateJob, type Job, type Ctx } from "../../src/sourcing/rules";

const settings = { minHourlyPay: 12.83, defaultWeeklyHours: 37.5 };
const ctx = (o: Partial<Ctx> = {}): Ctx => ({ registerMatched: true, existingKeys: new Set(), settings, ...o });
const job = (o: Partial<Job> = {}): Job => ({
  title: "Support Worker", location: "Leeds", payText: "£13.00 per hour", hoursText: null,
  applyUrl: "https://x.example/job/1", description: "Join us", ...o,
});

describe("evaluateJob", () => {
  it("publishes a clean job", () => {
    const r = evaluateJob(job(), ctx());
    expect(r.publish).toBe(true);
    expect(r.reasons).toEqual([]);
  });
  it("£12.83 passes", () => expect(evaluateJob(job({ payText: "£12.83 per hour" }), ctx()).publish).toBe(true));
  it("£12.82 fails below_minimum", () => {
    const r = evaluateJob(job({ payText: "£12.82 per hour" }), ctx());
    expect(r.publish).toBe(false);
    expect(r.reasons).toContain("below_minimum");
  });
  it("competitive pay is pay_unverified", () => {
    expect(evaluateJob(job({ payText: "Competitive" }), ctx()).reasons).toContain("pay_unverified");
  });
  it("£24,000 per annum with no hours converts at 37.5h and fails", () => {
    const r = evaluateJob(job({ payText: "£24,000 per annum" }), ctx());
    expect(r.hourly).toBeCloseTo(12.31, 2);
    expect(r.reasons).toContain("below_minimum");
  });
  it("missing apply link rejects", () => {
    expect(evaluateJob(job({ applyUrl: "" }), ctx()).reasons).toContain("no_apply_link");
  });
  it("no register match rejects", () => {
    expect(evaluateJob(job(), ctx({ registerMatched: false })).reasons).toContain("no_register_match");
  });
  it("duplicate rejects (case-insensitive)", () => {
    const c = ctx({ existingKeys: new Set(["support worker|leeds"]) });
    expect(evaluateJob(job({ title: "Support Worker", location: "LEEDS" }), c).reasons).toContain("duplicate");
  });
  it("refusing sponsorship rejects", () => {
    expect(evaluateJob(job({ description: "We are unable to offer sponsorship" }), ctx()).reasons).toContain("sponsorship_refused");
  });
  it("collects several reasons", () => {
    const r = evaluateJob(job({ payText: "", applyUrl: "" }), ctx({ registerMatched: false }));
    expect(r.reasons).toEqual(expect.arrayContaining(["pay_unverified", "no_apply_link", "no_register_match"]));
  });
  it("caps a care title with sponsorship wording at switch_only", () => {
    const r = evaluateJob(job({ title: "Care Worker", description: "Visa sponsorship available" }), ctx());
    expect(r.sponsorshipState).toBe("switch_only");
    expect(r.note).toBe("Check sponsorship with the employer");
  });
});
