// Shared between app/(auth)/actions.ts (a "use server" file, which may only
// export async functions) and the client forms that need these types/values.

export const TERMS_VERSION = "2026-08-01";

export type AuthState = { error?: string; email?: string } | null;
