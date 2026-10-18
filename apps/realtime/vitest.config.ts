import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import { defineConfig } from "vitest/config";

// obscenity is CommonJS behind an ESM wrapper, which the workers test runtime can't load (the
// deployed Worker is bundled by wrangler's esbuild and is fine). Bundle it once to ESM for tests.
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "vitest.config.ts"));
const obscenityCjs = require.resolve("obscenity", {
  paths: [join(here, "../../packages/protocol")],
});
const obscenityEsm = join(here, "node_modules/.cache/obscenity.mjs");
buildSync({
  stdin: {
    contents: `export { asteriskCensorStrategy, englishDataset, englishRecommendedTransformers, RegExpMatcher, TextCensor } from ${JSON.stringify(obscenityCjs)};`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "esm",
  platform: "neutral",
  outfile: obscenityEsm,
  logLevel: "error",
});

export default defineConfig({
  resolve: { alias: { obscenity: obscenityEsm } },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          REALTIME_TICKET_SECRET: "test-ticket-secret",
          INTERNAL_HMAC_SECRET: "test-hmac-secret",
          CHAT_SIGN_SECRET: "test-chat-secret",
          ALLOWED_ORIGINS: "http://game.test",
          GRACE_MS: "150",
          BOT_HMAC_SECRET: "test-bot-secret",
          BOT_SERVICE_URL: "http://bots.test/move",
          WEB_ORIGIN: "http://web.test",
        },
      },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
});
