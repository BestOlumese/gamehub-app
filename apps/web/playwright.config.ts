import { defineConfig, devices } from "@playwright/test";

// Needs: Docker services (pnpm services:up), migrated local DB, and a running app.
// By default starts `next start` on :3000; set E2E_BASE_URL to test an already-running server.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm exec next start -p 3000",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
