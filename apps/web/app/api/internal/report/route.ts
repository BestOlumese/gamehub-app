import { reportRequest } from "@gamehub/protocol";
import { verifyBody } from "@gamehub/protocol/hmac";
import { env } from "@/server/env";
import { recordReport } from "@/server/moderation";

// A player's report from a room or tournament lobby (HMAC; the room verified the chat line).
export async function POST(req: Request) {
  const secret = env().INTERNAL_HMAC_SECRET;
  if (!secret) return Response.json({ error: "OFF" }, { status: 503 });
  const body = await req.text();
  if (body.length > 8 * 1024) return Response.json({ error: "TOO_BIG" }, { status: 413 });
  const signed = await verifyBody(
    secret,
    body,
    req.headers.get("x-gh-ts"),
    req.headers.get("x-gh-sig"),
  );
  if (!signed) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const parsed = reportRequest.safeParse(json);
  if (!parsed.success) return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
  return Response.json({ ok: true, ...(await recordReport(parsed.data)) });
}
