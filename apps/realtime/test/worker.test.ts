import { env, runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("worker", () => {
  it("answers health checks", async () => {
    const res = await exports.default.fetch("https://realtime.test/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("does not expose rooms before ticket checks exist", async () => {
    const res = await exports.default.fetch("https://realtime.test/parties/room/ABC123");
    expect(res.status).toBe(404);
  });
});

describe("durable objects", () => {
  for (const binding of ["Room", "Match", "Presence"] as const) {
    it(`${binding} is SQLite-backed`, async () => {
      const stub = env[binding].getByName("test");
      await runInDurableObject(stub, (_instance, state) => {
        state.storage.sql.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");
        state.storage.sql.exec("INSERT INTO t (id) VALUES (1)");
        expect(state.storage.sql.exec("SELECT count(*) AS n FROM t").one()).toEqual({ n: 1 });
      });
    });
  }
});
