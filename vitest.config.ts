import { defineConfig } from "vitest/config";

// Pure-logic tests (tests/**). The Worker itself is type-checked with
// `npm run typecheck`; there is no browser/Workers runtime in these tests.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
