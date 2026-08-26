// Protected-characteristics guardrail for employer chat search — SPRINTS.md
// Sprint 8, non-negotiable #5: "an employer conversational AI search is
// planned, but must be descriptive, not evaluative... and must
// hard-exclude protected characteristics (Equality Act 2010) from query
// handling — even if an employer phrases a query that way. The guardrail
// needs a real validation layer, not just a prompt instruction."
//
// Three independent layers, not one:
//   1. Structural: the search_candidates tool schema (see employer-chat.ts)
//      has no parameter that could even encode a protected characteristic —
//      no age/sex/ethnicity/religion field exists to fill in. This is the
//      strongest guarantee, same philosophy as CV import's sensitive-data
//      handling — nowhere to put it, not just told not to.
//   2. This module: a deterministic keyword/phrase check, run BEFORE the
//      message ever reaches the model. If it matches, the model is never
//      called at all for that message — this is the "real check" the
//      non-negotiable asks for, not just a system-prompt instruction.
//   3. The system prompt (in employer-chat.ts) additionally tells the model
//      never to comply if a characteristic slips through rephrased — pure
//      defense in depth, not the primary control.
//
// Deliberately narrow to CANDIDATE characteristics in a hiring context, not
// general topic words — "elderly care" or "dementia care" describe the
// *service/client*, not a filter on the candidate, and must not trip this.
// The patterns below target phrasing that describes the person being
// searched for, not the care setting.

// Characteristic words matched against role/qualifier words within a bounded
// character gap (not strict adjacency) — "female care staff preferred" has
// "care" sitting between "female" and "staff", which a strict \s+ adjacency
// match misses entirely. A found-and-fixed bug: the first version of this
// guardrail used strict adjacency and let exactly that phrasing through.
const ROLE_OR_QUALIFIER_WORDS = "(?:candidate|carer|nurse|worker|staff|applicant|employee|position|role|only|preferred|required)";
const GAP = "(?:\\s+\\w+){0,3}\\s+"; // up to 3 filler words between the characteristic and the role/qualifier word

function proximityPattern(characteristics: string, roleWords: string = ROLE_OR_QUALIFIER_WORDS, alsoMatchReversed = true): RegExp {
  const forward = `\\b(?:${characteristics})${GAP}${roleWords}\\b`;
  const reversed = alsoMatchReversed ? `|\\b${roleWords}${GAP}(?:${characteristics})\\b` : "";
  return new RegExp(forward + reversed, "i");
}

// Deliberately excludes "person(s)/someone/people" — "experience working with
// young people" / "supporting older people" describe the *client population*
// a candidate works with, not the candidate themselves, and are completely
// standard care-sector phrasing. A found-and-fixed bug: an earlier version of
// this guardrail included "people" in the general role-word list and
// false-blocked both of those legitimate example queries.
const AGE_QUALIFIER_WORDS = "(?:candidate|carer|nurse|worker|staff|applicant|employee|position|role|only|preferred|required)";

const PROTECTED_CHARACTERISTIC_PATTERNS: { category: string; pattern: RegExp }[] = [
  {
    category: "age",
    pattern: new RegExp(
      proximityPattern("young(?:er)?|old(?:er)?|mature|fresh(?:ly)? graduat\\w*", AGE_QUALIFIER_WORDS).source +
        "|\\bunder\\s?\\d{2}\\b|\\bover\\s?\\d{2}\\b|\\b(?:aged?|age)\\s+(?:under|over|below|above)?\\s*\\d{2}\\b|\\bno\\s+(?:older|younger)\\s+than\\b",
      "i",
    ),
  },
  {
    category: "sex/gender",
    pattern: proximityPattern("male|female|man|woman|men|women|guy|girl"),
  },
  {
    category: "gender reassignment",
    pattern: /\b(cisgender|cis-gender|transgender|trans(?:-|\s)?(?:man|woman|person)?)\b(?!\s*care)/i,
  },
  {
    category: "marriage/civil partnership",
    pattern: proximityPattern("married|unmarried|single|divorced|widowed"),
  },
  {
    category: "pregnancy/maternity",
    pattern: /\b(pregnant|not\s+pregnant|non-pregnant|maternity\s+leave\s+risk|planning\s+(a\s+)?(family|pregnancy))\b/i,
  },
  {
    category: "race/ethnicity",
    pattern: new RegExp(
      proximityPattern("white|black|asian|hispanic|latino|latina|caucasian|african|european|british[- ]?born").source +
        "|\\bsame\\s+(?:race|ethnicity)\\b",
      "i",
    ),
  },
  {
    category: "religion or belief",
    pattern: proximityPattern("christian|muslim|jewish|hindu|sikh|buddhist|atheist|catholic|protestant|no\\s+religion"),
  },
  {
    category: "sexual orientation",
    pattern: proximityPattern("straight|heterosexual|homosexual|gay|lesbian|bisexual"),
  },
  {
    category: "disability",
    pattern: /\b(able-?bodied|non-?disabled|no\s+disabilit\w*|without\s+(a\s+)?disabilit\w*|physically\s+fit\s+only)\b/i,
  },
  {
    category: "national origin/immigration status",
    pattern: /\b(british\s+only|uk\s+citizens?\s+only|no\s+visa|no\s+sponsorship\s+needed\s+candidates?\s+only|born\s+in\s+(the\s+)?uk)\b/i,
  },
];

export type GuardrailResult = { blocked: true; category: string } | { blocked: false };

export function checkProtectedCharacteristics(message: string): GuardrailResult {
  for (const { category, pattern } of PROTECTED_CHARACTERISTIC_PATTERNS) {
    if (pattern.test(message)) {
      return { blocked: true, category };
    }
  }
  return { blocked: false };
}

export const GUARDRAIL_REDIRECT_MESSAGE =
  "I can't filter candidates by personal characteristics like age, sex, race, religion, disability, or similar — that's not something iCare search does, for legal and ethical reasons (Equality Act 2010). " +
  "I can help with profession, skills, location, travel radius, and availability instead — try rephrasing around what the role actually needs.";

// SPRINTS.md Sprint 10 — "Who is [name]" AI summary. Unlike search (where
// the model never sees candidate data at all), this tool deliberately
// generates prose from real profile data — SPRINTS.md itself calls this
// "the sharpest edge of non-negotiable #5 in the whole employer product."
// The system prompt is the primary control (see employer-chat.ts), but per
// this codebase's "a real check, not just a prompt instruction" standard
// applied everywhere else, this is a second, independent output-side net:
// a deterministic scan for evaluative/recommending language in whatever
// the model actually produced. If it fires, the caller falls back to a
// template built only from structured fields — never ships evaluative
// prose just because the prompt was supposed to prevent it.
const EVALUATIVE_LANGUAGE_PATTERN =
  /\b(strong|great|good|ideal|perfect|excellent|outstanding|impressive|top|best)\s+(candidate|fit|hire|choice|match)\b|\b(highly|strongly)\s+recommend|\bstands?\s+out\b|\bwould\s+(be\s+)?(a\s+)?(great|good|excellent|perfect)\b|\bnot\s+suitable\b|\bpoor\s+fit\b/i;

export function containsEvaluativeLanguage(text: string): boolean {
  return EVALUATIVE_LANGUAGE_PATTERN.test(text);
}
