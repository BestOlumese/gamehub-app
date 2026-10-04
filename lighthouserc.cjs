// Lighthouse CI, mobile preset (Lighthouse default), median of 3 runs.
// Targets from docs/00-overview.md and docs/10-performance.md.
module.exports = {
  ci: {
    collect: {
      startServerCommand: "pnpm --filter web exec next start -p 3200",
      startServerReadyPattern: "Ready",
      url: ["http://localhost:3200/"],
      numberOfRuns: 3,
      settings: { chromeFlags: "--no-sandbox --headless=new" },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.95 }],
        "categories:accessibility": ["error", { minScore: 1 }],
        "categories:best-practices": ["error", { minScore: 1 }],
        "categories:seo": ["error", { minScore: 1 }],
      },
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci" },
  },
};
