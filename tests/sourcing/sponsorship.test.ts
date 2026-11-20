import { describe, expect, it } from "vitest";
import { detectSponsorship, isCareTitle, mapSponsorshipState } from "../../src/sourcing/sponsorship";

describe("detectSponsorship", () => {
  it("sees an offer", () => {
    expect(detectSponsorship("We offer Skilled Worker visa sponsorship for this role")).toEqual({ mentions: true, negated: false });
  });
  it.each([
    "We are unable to offer sponsorship",
    "Unfortunately we cannot sponsor visas",
    "No sponsorship available",
    "Applicants must already have the right to work in the UK - we do not offer sponsorship",
    "Sponsorship is not available for this post",
  ])("treats a refusal as negated: %s", (t) => {
    expect(detectSponsorship(t)).toEqual({ mentions: true, negated: true });
  });
  it("does not treat an unrelated 'do not offer' as a sponsorship refusal", () => {
    expect(detectSponsorship("Visa sponsorship is available. We do not offer relocation or accommodation.")).toEqual({ mentions: true, negated: false });
  });
  it("sees silence", () => {
    expect(detectSponsorship("Join our friendly team in Leeds")).toEqual({ mentions: false, negated: false });
  });
});

describe("isCareTitle", () => {
  it.each(["Care Worker", "Senior Care Assistant", "Carer", "Senior Care Worker", "Care Assistant - Nights", "Bank Carer"])("matches %s", (t) => {
    expect(isCareTitle(t)).toBe(true);
  });
  it.each(["Careers Advisor", "Career Coach", "Care Home Manager", "Registered Nurse", "Support Worker", "Caretaker"])("does not match %s", (t) => {
    expect(isCareTitle(t)).toBe(false);
  });
});

describe("mapSponsorshipState", () => {
  it("caps care titles at switch_only with a note", () => {
    expect(mapSponsorshipState("Care Worker", "Visa sponsorship available")).toEqual({
      state: "switch_only",
      note: "Check sponsorship with the employer",
    });
  });
  it("gives none to a care title that is silent", () => {
    expect(mapSponsorshipState("Care Worker", "Join us").state).toBe("none");
  });
  it("lets a registered nurse be new_applicant", () => {
    expect(mapSponsorshipState("Registered Nurse", "Skilled Worker sponsorship available").state).toBe("new_applicant");
  });
  it("gives none when negated", () => {
    expect(mapSponsorshipState("Registered Nurse", "We cannot offer sponsorship").state).toBe("none");
  });
});
