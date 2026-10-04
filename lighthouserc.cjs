// Lighthouse CI, mobile preset (Lighthouse default), median of 3 runs.
// Targets from docs/00-overview.md and docs/10-performance.md.
const strict = {
  "categories:accessibility": ["error", { minScore: 1 }],
  "categories:best-practices": ["error", { minScore: 1 }],
  "categories:seo": ["error", { minScore: 1 }],
};

module.exports = {
  ci: {
    collect: {
      startServerCommand: "pnpm --filter web exec next start -p 3200",
      startServerReadyPattern: "Ready",
      url: [
        "http://localhost:3200/",
        "http://localhost:3200/legal/privacy",
        "http://localhost:3200/login",
        "http://localhost:3200/signup",
      ],
      numberOfRuns: 3,
      settings: { chromeFlags: "--no-sandbox --headless=new" },
    },
    assert: {
      assertMatrix: [
        {
          matchingUrlPattern: "localhost:3200/(legal/.*)?$",
          assertions: { "categories:performance": ["error", { minScore: 0.95 }], ...strict },
        },
        {
          matchingUrlPattern: "localhost:3200/(login|signup)$",
          assertions: { "categories:performance": ["error", { minScore: 0.9 }], ...strict },
        },
      ],
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci" },
  },
};
