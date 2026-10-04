import type { TicketClaims } from "@gamehub/protocol";
import { jwtVerify } from "jose";

export const TICKET_AUDIENCE = "gamehub-realtime";

export function originAllowed(req: Request, env: Env): boolean {
  const origin = req.headers.get("Origin");
  return (
    !!origin &&
    env.ALLOWED_ORIGINS.split(",")
      .map((s) => s.trim())
      .includes(origin)
  );
}

/** Verifies `?ticket=` (HS256, ≤ 60 s old, right audience and scope). */
export async function verifyTicket(
  req: Request,
  env: Env,
  expectedScope: string,
): Promise<TicketClaims | null> {
  const token = new URL(req.url).searchParams.get("ticket");
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(env.REALTIME_TICKET_SECRET),
      {
        algorithms: ["HS256"],
        audience: TICKET_AUDIENCE,
        maxTokenAge: "60s",
      },
    );
    if (
      payload.scope !== expectedScope ||
      typeof payload.sub !== "string" ||
      typeof payload.name !== "string"
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      name: payload.name,
      avatar: typeof payload.avatar === "string" ? payload.avatar : null,
      scope: expectedScope as TicketClaims["scope"],
    };
  } catch {
    return null;
  }
}
