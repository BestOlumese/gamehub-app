import { signBody } from "@gamehub/protocol/hmac";
import { Chess } from "chess.js";
import { beforeAll, describe, expect, it } from "vitest";

// Real Stockfish (lite WASM) in Node. The env is set before the route module loads.
const SECRET = "test-bot-secret-0123456789abcdef0123456789";
let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  process.env.BOT_HMAC_SECRET = SECRET;
  process.env.DATABASE_URL ??= "postgres://u:p@localhost:5433/x";
  process.env.BETTER_AUTH_SECRET ??= "x".repeat(32);
  ({ POST } = await import("./route"));
});

const FENS = [
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
  "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
  "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
  "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1",
];

async function call(payload: unknown, sign = true) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sign) {
    const { ts, sig } = await signBody(SECRET, body);
    headers["x-gh-ts"] = ts;
    headers["x-gh-sig"] = sig;
  }
  const res = await POST(
    new Request("http://x/api/bots/chess/move", { method: "POST", body, headers }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
const req = (position: string, level = "hard", history: string[] = []) => ({
  game: "chess",
  level,
  position,
  history,
  movetimeMs: 200,
  roomId: "TEST01",
});

describe("bot service: chess", () => {
  it("refuses unsigned, wrongly signed and malformed requests before any engine work", async () => {
    expect((await call(req(FENS[0]!), false)).status).toBe(401);
    const body = JSON.stringify(req(FENS[0]!));
    const { ts } = await signBody("another-secret-0123456789abcdef0123456", body);
    const forged = await POST(
      new Request("http://x", {
        method: "POST",
        body,
        headers: { "x-gh-ts": ts, "x-gh-sig": "ab".repeat(32) },
      }),
    );
    expect(forged.status).toBe(401);
    expect((await call({ ...req(FENS[0]!), level: "easy" })).status).toBe(400);
    const huge = await POST(new Request("http://x", { method: "POST", body: "x".repeat(5000) }));
    expect(huge.status).toBe(413);
  });

  it("plays a legal move in each position, within the think limit, and mates in one", async () => {
    for (const [i, fen] of FENS.entries()) {
      const t = performance.now();
      const { status, json } = await call(req(fen, i % 2 ? "medium" : "hard"));
      const wall = performance.now() - t;
      expect(status, JSON.stringify(json)).toBe(200);
      const legal = new Chess(fen).moves({ verbose: true }).map((m) => m.lan);
      expect(legal).toContain(json.move);
      if (i > 0) expect(wall).toBeLessThan(200 + 400); // the first call includes the cold start
    }
    const mate = await call(req("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", "hard"));
    expect(mate.json.move).toBe("a1a8");
  }, 60_000);

  it("takes the moves since the last irreversible move into account", async () => {
    const { json } = await call(req(FENS[0]!, "hard", ["g1f3", "g8f6"]));
    const c = new Chess(FENS[0]!);
    c.move({ from: "g1", to: "f3" });
    c.move({ from: "g8", to: "f6" });
    expect(c.moves({ verbose: true }).map((m) => m.lan)).toContain(json.move);
  }, 30_000);

  it("leaves the server's fetch alone (the engine nulls fetch in its own thread only)", async () => {
    await call(req(FENS[0]!));
    expect(typeof globalThis.fetch).toBe("function");
  }, 30_000);

  it("one search at a time: beyond 3 waiting, it answers BUSY", async () => {
    const results = await Promise.all(Array.from({ length: 7 }, () => call(req(FENS[1]!))));
    const codes = results.map((r) => r.json.code ?? "ok");
    expect(codes.filter((c) => c === "BUSY").length).toBeGreaterThan(0);
    expect(codes.filter((c) => c === "ok").length).toBeGreaterThanOrEqual(3);
  }, 60_000);
});
