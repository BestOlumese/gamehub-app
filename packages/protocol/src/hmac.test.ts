import { describe, expect, it } from "vitest";
import { signBody, verifyBody } from "./hmac";

describe("hmac", () => {
  it("verifies its own signatures", async () => {
    const { ts, sig } = await signBody("s3cret", '{"a":1}');
    expect(await verifyBody("s3cret", '{"a":1}', ts, sig)).toBe(true);
  });
  it("rejects tampering, wrong secrets, stale and malformed input", async () => {
    const now = Date.now();
    const { ts, sig } = await signBody("s3cret", "body", now);
    expect(await verifyBody("s3cret", "body!", ts, sig)).toBe(false);
    expect(await verifyBody("other", "body", ts, sig)).toBe(false);
    expect(await verifyBody("s3cret", "body", ts, sig, now + 6 * 60_000)).toBe(false);
    expect(await verifyBody("s3cret", "body", ts, "zz")).toBe(false);
    expect(await verifyBody("s3cret", "body", null, sig)).toBe(false);
  });
});
