export type SponsorshipState = "none" | "switch_only" | "new_applicant";

// A refusal must name sponsorship (or visas) within a few words of the negation,
// so "we do not offer relocation" is not read as refusing sponsorship.
const NEG = String.raw`(?:unable|not able|cannot|can't|can not|won't|will not|do not|don't|does not|doesn't|not)`;
const OBJ = String.raw`(?:\w+\s+){0,4}?(?:sponsor\w*|visas?)`;
const NEGATION = [
  new RegExp(String.raw`\b${NEG}\s+(?:to\s+)?${OBJ}`),
  /\bno\s+(visa\s+)?sponsorship\b/,
  /\bsponsorship\s+(is\s+)?(not|unavailable)\b/,
  /\bwithout\s+(the\s+need\s+for\s+)?sponsorship\b/,
];
const MENTION = /\bsponsor(ship|ed|ing)?\b|\bskilled worker\b|\bcertificate of sponsorship\b|\bcos\b/;

export function detectSponsorship(text: string | null | undefined): { mentions: boolean; negated: boolean } {
  const t = (text || "").toLowerCase().replace(/[’‘]/g, "'");
  if (!MENTION.test(t)) return { mentions: false, negated: false };
  return { mentions: true, negated: NEGATION.some((r) => r.test(t)) };
}

// Care worker / senior care worker / care assistant / carer (route closed 22 Jul 2025).
const CARE_TITLE = /(^|[^a-z])(senior\s+)?(care\s+(worker|assistant)s?|carers?)([^a-z]|$)/i;

export function isCareTitle(title: string | null | undefined): boolean {
  return CARE_TITLE.test(title || "");
}

export function mapSponsorshipState(
  title: string,
  text: string,
): { state: SponsorshipState; note?: string } {
  const s = detectSponsorship(text);
  if (!s.mentions || s.negated) return { state: "none" };
  if (isCareTitle(title)) return { state: "switch_only", note: "Check sponsorship with the employer" };
  return { state: "new_applicant" };
}
