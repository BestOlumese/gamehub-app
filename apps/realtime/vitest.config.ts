import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
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
        },
      },
    }),
  ],
  test: { include: ["test/**/*.test.ts"] },
});
