import { describe, expect, it } from "vitest";
import { parseHourlyPay } from "../../src/sourcing/pay";

describe("parseHourlyPay", () => {
  it("reads an hourly figure", () => {
    expect(parseHourlyPay("£12.83 per hour", null, 37.5)).toEqual({ hourly: 12.83 });
  });
  it("keeps £12.82 as 12.82 (the rules engine, not the parser, applies the minimum)", () => {
    expect(parseHourlyPay("£12.82 an hour", null, 37.5)).toEqual({ hourly: 12.82 });
  });
  it("uses the lower figure of a range", () => {
    expect(parseHourlyPay("£12-£14 per hour", null, 37.5)).toEqual({ hourly: 12 });
  });
  it("converts an annual salary with default weekly hours", () => {
    const r = parseHourlyPay("£24,000 per annum", null, 37.5);
    expect(r.hourly).toBeCloseTo(24000 / 52 / 37.5, 4);
    expect(r.hourly).toBeCloseTo(12.31, 2);
  });
  it("converts an annual salary using stated weekly hours", () => {
    const r = parseHourlyPay("£24,000 per annum", "20 hours per week", 37.5);
    expect(r.hourly).toBeCloseTo(24000 / 52 / 20, 4);
  });
  it("treats a bare figure above 100 as annual", () => {
    expect(parseHourlyPay("£26,000", null, 37.5).hourly).toBeCloseTo(26000 / 52 / 37.5, 4);
  });
  it("does not guess monthly pay", () => {
    expect(parseHourlyPay("£1,500 per month", null, 37.5)).toEqual({ hourly: null, reason: "pay_unverified" });
  });
  it.each(["competitive", "negotiable", "", null])("rejects non-numeric pay %j", (t) => {
    expect(parseHourlyPay(t as string | null, null, 37.5)).toEqual({ hourly: null, reason: "pay_unverified" });
  });
});
