import { hardMove } from "@gamehub/engine/draughts/service";
import { BOT_MAX_BODY, draughtsBotRequest, type BotMoveResponse } from "@gamehub/protocol/bots";
import { verifyBody } from "@gamehub/protocol/hmac";
import { env } from "@/server/env";

// Hard draughts bot for the room DOs (docs/15-bot-service.md): our own search, given more time
// than a Worker can spare. Signed calls only.
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
  const parsed = draughtsBotRequest.safeParse(json);
  if (!parsed.success) return reply({ ok: false, code: "BAD_REQUEST" }, 400);
  const { movetimeMs, game: _g, level: _l, roomId: _r, ...position } = parsed.data;

  const start = performance.now();
  const until = start + movetimeMs;
  try {
    const { move } = hardMove(position, () => performance.now() >= until);
    if (!move) return reply({ ok: false, code: "BAD_REQUEST" }, 400);
    const cpuMs = Math.round(performance.now() - start);
    return reply({ ok: true, move, cpuMs, engine: "gamehub-draughts" });
  } catch {
    return reply({ ok: false, code: "ENGINE_ERROR" }, 500);
  }
}
