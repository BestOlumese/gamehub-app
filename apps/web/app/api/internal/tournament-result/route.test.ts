import { signBody } from "@gamehub/protocol/hmac";
import { beforeAll, describe, expect, it } from "vitest";

// Signature and shape checks only (no database here; the E2E stores a real tournament).
const SECRET = "test-internal-secret-0123456789abcdef0123";
let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  process.env.INTERNAL_HMAC_SECRET = SECRET;
  process.env.DATABASE_URL ??= "postgres://u:p@localhost:5433/x";
  process.env.BETTER_AUTH_SECRET ??= "x".repeat(32);
  ({ POST } = await import("./route"));
}, 60_000); // the route pulls in the database layer: slow to load when every package tests at once

async function call(body: string, secret: string | null = SECRET) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret) {
    const { ts, sig } = await signBody(secret, body);
    headers["x-gh-ts"] = ts;
    headers["x-gh-sig"] = sig;
  }
  const res = await POST(
    new Request("http://x/api/internal/tournament-result", { method: "POST", body, headers }),
  );
  return res.status;
}

describe("tournament results ingest", () => {
  it("refuses unsigned, wrongly signed and malformed posts before touching the database", async () => {
    expect(await call("{}", null)).toBe(401);
    expect(await call("{}", "another-secret-0123456789abcdef0123456789")).toBe(401);
    expect(await call("not json")).toBe(400);
    expect(await call(JSON.stringify({ id: "t_1", code: "ABCDEFG" }))).toBe(400);
    expect(await call("x".repeat(300 * 1024))).toBe(413);
  });
});
