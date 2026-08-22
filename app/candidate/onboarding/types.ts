// Shared between app/(candidate)/onboarding/actions.ts (a "use server" file,
// which may only export async functions) and the client step components.

export type StepState = { error?: string } | undefined;
