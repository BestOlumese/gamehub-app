import { defineConfig } from "vitest/config";

export default defineConfig({
  // Property tests play thousands of games; give them room on slow CI runners.
  test: { include: ["src/**/*.test.ts", "test/**/*.test.ts"], testTimeout: 60_000 },
});
