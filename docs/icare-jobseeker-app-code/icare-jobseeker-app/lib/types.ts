export type BadgeGrade = "verified" | "evidenced" | "derived" | "declared";

export interface CredentialItem {
  id: string;
  title: string;
  subtitle: string;
  grade: BadgeGrade;
}

export interface DbsStatus {
  // These three strings are the only permitted values anywhere in the
  // product. Never render "Verified" or "clean" for DBS — see compliance
  // notes in /docs/compliance/dbs.md.
  state: "not_yet_verified" | "current_no_new_information" | "new_information_reported";
  checkedAt?: string;
}

export interface ProfileData {
  id: string;
  fullName: string;
  initials: string;
  roleTitle: string;
  location: string;
  availability: string;
  findable: boolean;
  about: string;
  registrationsAndTraining: CredentialItem[];
  experience: CredentialItem[];
  currentEmployerName: string; // always hidden pre-acceptance, regardless of grade
  dbs: DbsStatus;
}

export const dbsStatusLabel: Record<DbsStatus["state"], string> = {
  not_yet_verified: "Not Yet Verified",
  current_no_new_information: "Current — no new information",
  new_information_reported: "New information reported",
};

// Fields hidden from every employer until they hold an accepted invite
// for a specific role. This list is intentionally not user-configurable —
// see visibility wireframe notes on the fixed vs. governed-field split.
export const ALWAYS_HIDDEN_PRE_ACCEPTANCE = [
  "Full name",
  "Photo",
  "Phone & email",
  "Exact address",
  "Current employer name",
] as const;

// ---------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------

export interface Invite {
  id: string;
  employerName: string;
  employerInitials: string;
  roleTitle: string;
  setting: string;
  location: string;
  distanceMiles: number;
  hoursPattern: string;
  invitedAt: string; // ISO date
  expiresAt: string; // ISO date — invitedAt + 7 days, decided fixed window
  status: "new" | "accepted" | "declined" | "expired";
}

// Fixed list, identical for every profession and role type — decided.
// "Prefer not to say" is a complete, valid answer; there is no way to
// decline without selecting one of these.
export const DECLINE_REASONS = [
  { id: "not_looking", label: "Not looking for work at the moment" },
  { id: "pattern", label: "Not available for this pattern" },
  { id: "distance", label: "Too far to travel" },
  { id: "wrong_role", label: "Not the right role for me right now" },
  { id: "accepted_elsewhere", label: "Already accepted another offer" },
  { id: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

export type DeclineReasonId = (typeof DECLINE_REASONS)[number]["id"];

// Internal-only signal, never surfaced to any employer. Product/support
// tooling reads this counter; it is not part of the candidate-facing API.
export const PREFER_NOT_TO_SAY_FLAG_THRESHOLD = 5;

// ---------------------------------------------------------------------
// Pipelines — six decided stage names; mechanics behind each still open.
// ---------------------------------------------------------------------

export type PipelineStage =
  | "shortlisted"
  | "invited_for_interview"
  | "pending_interview_result"
  | "successful"
  | "rejected"
  | "onboarding";

export const PIPELINE_STAGE_LABEL: Record<PipelineStage, string> = {
  shortlisted: "Shortlisted",
  invited_for_interview: "Invited for Interview",
  pending_interview_result: "Pending Interview Result",
  successful: "Successful",
  rejected: "Rejected",
  onboarding: "Onboarding",
};

// Used purely for styling — a terminal-positive, terminal-negative, or
// in-progress tone. Rejected deliberately gets a neutral, not alarming,
// treatment rather than a warning colour.
export function pipelineStageTone(stage: PipelineStage): "progress" | "positive" | "neutral" {
  if (stage === "successful" || stage === "onboarding") return "positive";
  if (stage === "rejected") return "neutral";
  return "progress";
}

export interface Pipeline {
  id: string;
  employerName: string;
  roleTitle: string;
  stage: PipelineStage;
  stageDetail: string; // e.g. interview date, or the access-revocation line
  closed: boolean;
}

// ---------------------------------------------------------------------
// Visibility settings
// ---------------------------------------------------------------------

export type VisibilityLevel = "public" | "employers_only" | "private";

export interface VisibilityField {
  key: string;
  label: string;
  level: VisibilityLevel;
}

// ---------------------------------------------------------------------
// Network (phase-2 candidate — kept behind its own route so it can be
// dropped from the tab bar without touching anything else)
// ---------------------------------------------------------------------

export interface NetworkPerson {
  id: string;
  name: string;
  roleTitle: string;
  location: string;
}

export interface NetworkOrg {
  id: string;
  name: string;
  kind: string;
}

// ---------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------

export interface OnboardingStepMeta {
  index: number; // 1-based
  title: string;
  findableFrom: boolean; // true once profile becomes searchable at this step
}

export const ONBOARDING_STEPS: OnboardingStepMeta[] = [
  { index: 1, title: "Profession & role", findableFrom: false },
  { index: 2, title: "Location & travel", findableFrom: false },
  { index: 3, title: "Experience", findableFrom: true },
  { index: 4, title: "CV upload & confirm", findableFrom: true },
  { index: 5, title: "Registrations", findableFrom: true },
  { index: 6, title: "Availability", findableFrom: true },
  { index: 7, title: "Visibility choices", findableFrom: true },
];
