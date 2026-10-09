import { BOT_MAX_BODY, botMoveRequest, type BotMoveResponse } from "@gamehub/protocol/bots";
import { verifyBody } from "@gamehub/protocol/hmac";
import { bestMove, BotError } from "@/server/bots/stockfish";
import { env } from "@/server/env";

// Medium/Hard chess bots for the room DOs (docs/15-bot-service.md). Signed calls only.
// Node runtime (the default; Cache Components forbids the "runtime" segment option).
export const maxDuration = 10;

const reply = (body: BotMoveResponse, status = 200) => Response.json(body, { status });

export async function POST(req: Request) {
  const secret = env().BOT_HMAC_SECRET;
  if (!secret) return reply({ ok: false, code: "OFF" }, 503);
  const body = await req.text();
  if (body.length > BOT_MAX_BODY) return reply({ ok: false, code: "BAD_REQUEST" }, 413);
  // Signature first: no engine work for unsigned requests.
  const signed = await verifyBody(
    secret,
    body,
    req.headers.get("x-gh-ts"),
    req.headers.get("x-gh-sig"),
  );
  if (!signed) return reply({ ok: false, code: "UNAUTHORIZED" }, 401);

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return reply({ ok: false, code: "BAD_REQUEST" }, 400);
  }
  const parsed = botMoveRequest.safeParse(json);
  if (!parsed.success) return reply({ ok: false, code: "BAD_REQUEST" }, 400);
  const { position, history, level, movetimeMs } = parsed.data;

  try {
    const { move, cpuMs } = await bestMove(position, history, level, movetimeMs);
    return reply({ ok: true, move, cpuMs, engine: "stockfish-19-lite" });
  } catch (err) {
    const code = err instanceof BotError ? err.code : "ENGINE_ERROR";
    return reply({ ok: false, code }, code === "BUSY" || code === "QUOTA" ? 429 : 500);
  }
}
