import { defineConfig, devices } from "@playwright/test";

// Needs: Docker services (pnpm services:up), migrated local DB, and a running app.
// By default starts `next start` on :3000; set E2E_BASE_URL to test an already-running server.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  // Hard stop for the whole run so a stuck server can never hang CI.
  globalTimeout: 15 * 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Run next directly: a `pnpm exec` wrapper doesn't forward the stop signal, which
        // left the server running and the CI step waiting on it forever.
        command: "next start -p 3000",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
      },
});
