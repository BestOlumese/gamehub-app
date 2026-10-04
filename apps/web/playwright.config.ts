import { defineConfig, devices } from "@playwright/test";

// Needs: Docker services (pnpm services:up), a migrated local DB, a built web app,
// and apps/realtime/.dev.vars. Starts `next start` (:3000) and `wrangler dev` (:8787)
// unless E2E_BASE_URL points at an already-running web server.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
/** Short seat hold so "bot takes over" tests don't wait a minute. */
export const E2E_GRACE_MS = 3000;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
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
    : [
        {
          // Run next directly: a `pnpm exec` wrapper doesn't forward the stop signal, which
          // left the server running and the CI step waiting on it forever.
          command: "next start -p 3000",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
        },
        {
          command: `node_modules/.bin/wrangler dev --port 8787 --var GRACE_MS:${E2E_GRACE_MS}`,
          cwd: "../realtime",
          url: "http://localhost:8787/health",
          reuseExistingServer: !process.env.CI,
          timeout: 90_000,
          gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
        },
      ],
});
