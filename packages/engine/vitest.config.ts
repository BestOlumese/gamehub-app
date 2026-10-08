import { defineConfig } from "vitest/config";

export default defineConfig({
  // Property tests play thousands of games, and the chess ones run chess.js on every move:
  // give them room on slow CI runners (and when every package tests at once).
  test: { include: ["src/**/*.test.ts", "test/**/*.test.ts"], testTimeout: 180_000 },
});
