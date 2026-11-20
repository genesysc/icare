import { describe, expect, it } from "vitest";
import { normaliseName, matchRegister } from "../../src/sourcing/names";

describe("normaliseName", () => {
  it("treats Ltd and Limited alike", () => {
    expect(normaliseName("Acme Ltd")).toBe(normaliseName("ACME Limited."));
  });
  it("ignores case, punctuation, 'the', & vs and, spacing", () => {
    expect(normaliseName("The Acme & Sons Care Ltd")).toBe(normaliseName("acme and sons care limited"));
  });
  it("keeps distinct companies distinct", () => {
    expect(normaliseName("Acme Care Ltd")).not.toBe(normaliseName("Acme Homes Ltd"));
  });
});

describe("matchRegister", () => {
  const register = ["Acme Care Limited", "Beta Care Service Ltd", "Right at Home (Leeds) Ltd"];
  it("matches exact modulo suffix", () => {
    expect(matchRegister("Acme Care Ltd", register)).toEqual({ matched: "Acme Care Limited", score: 1 });
  });
  it("tolerates a plural at >=0.9", () => {
    expect(matchRegister("Beta Care Services Ltd", register)?.matched).toBe("Beta Care Service Ltd");
  });
  it("keeps the 0.9 threshold (a one-letter typo on a short name is not enough)", () => {
    expect(matchRegister("Beta Homecaree Ltd", ["Beta Homecare Ltd"])).toBeNull();
  });
  it("rejects a different company", () => {
    expect(matchRegister("Acme Homes Ltd", register)).toBeNull();
  });
  it("rejects empty", () => expect(matchRegister("", register)).toBeNull());
});
