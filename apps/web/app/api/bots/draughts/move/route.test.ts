import { draughtsNaija, legalMoves, notation } from "@gamehub/engine/draughts";
import { signBody } from "@gamehub/protocol/hmac";
import { beforeAll, describe, expect, it } from "vitest";

const SECRET = "test-bot-secret-0123456789abcdef0123456789";
let POST: (req: Request) => Promise<Response>;

beforeAll(async () => {
  process.env.BOT_HMAC_SECRET = SECRET;
  process.env.DATABASE_URL ??= "postgres://u:p@localhost:5433/x";
  process.env.BETTER_AUTH_SECRET ??= "x".repeat(32);
  ({ POST } = await import("./route"));
});

const START = "d".repeat(20) + ".".repeat(10) + "l".repeat(20);

async function call(payload: unknown, sign = true) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sign) {
    const { ts, sig } = await signBody(SECRET, body);
    headers["x-gh-ts"] = ts;
    headers["x-gh-sig"] = sig;
  }
  const res = await POST(
    new Request("http://x/api/bots/draughts/move", { method: "POST", body, headers }),
  );
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
const req = (board = START, turn: "light" | "dark" = "light") => ({
  game: "draughts",
  level: "hard",
  variant: "naija10",
  board,
  turn,
  menCaptureBackward: true,
  flyingKings: true,
  captureRule: "free",
  movetimeMs: 150,
  roomId: "TEST01",
});

describe("bot service: draughts", () => {
  it("refuses unsigned and malformed requests", async () => {
    expect((await call(req(), false)).status).toBe(401);
    expect((await call({ ...req(), board: "l".repeat(32) })).status).toBe(400);
  });

  it("plays a legal move within the think limit", async () => {
    const t = performance.now();
    const { status, json } = await call(req());
    expect(status, JSON.stringify(json)).toBe(200);
    // Searches 150 ms; the rest is headroom for busy CI machines (the room waits 1.5 s).
    expect(performance.now() - t).toBeLessThan(1500);
    const board = Array.from(START, (ch) => ({ d: -1, l: 1 })[ch as "d" | "l"] ?? 0);
    const legal = legalMoves({ board, turn: "light", variant: "naija10" }, draughtsNaija).map(
      notation,
    );
    expect(legal).toContain(json.move);
  });

  it("captures when it must", async () => {
    // A light king on 46 sees a dark man on 37 down its diagonal: the only legal moves take it.
    const b = Array.from({ length: 50 }, () => ".");
    b[45] = "L";
    b[36] = "d";
    b[0] = "d";
    const { json } = await call(req(b.join("")));
    expect(String(json.move)).toMatch(/^46x/);
  });
});
