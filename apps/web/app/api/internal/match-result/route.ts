import { matchResultSchema } from "@gamehub/protocol";
import { verifyBody } from "@gamehub/protocol/hmac";
import { env } from "@/server/env";
import { ingestMatch } from "@/server/results";

// A finished game from a room (private or quick match), signed with INTERNAL_HMAC_SECRET.
const MAX_BODY = 64 * 1024;

export async function POST(req: Request) {
  const secret = env().INTERNAL_HMAC_SECRET;
  if (!secret) return Response.json({ error: "OFF" }, { status: 503 });
  const body = await req.text();
  if (body.length > MAX_BODY) return Response.json({ error: "TOO_BIG" }, { status: 413 });
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
  const parsed = matchResultSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "BAD_REQUEST" }, { status: 400 });
  return Response.json({ ok: true, ...(await ingestMatch(parsed.data)) });
}
