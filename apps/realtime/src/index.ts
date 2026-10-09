import { createRoomRequest, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@gamehub/protocol";
import { verifyBody } from "@gamehub/protocol/hmac";
import { routePartykitRequest } from "partyserver";
import { originAllowed, verifyTicket } from "./auth";
import { CLAIMS_HEADER } from "./rooms/game-room";
import { gameFor } from "./rooms/games";

export { GameRoom } from "./rooms/game-room";
export { Matchmaker } from "./match/matchmaker";
export { Presence } from "./presence/presence";
export { Quota } from "./bots/quota";

const json = (body: unknown, status = 200) => Response.json(body, { status });

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  // 256 % 32 === 0, so a plain modulo is unbiased here.
  return [...bytes].map((b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join("");
}

/** POST /rooms, called by `web` with an HMAC signature. Creates a private room named by its code. */
async function createPrivateRoom(req: Request, env: Env): Promise<Response> {
  const body = await req.text();
  if (
    !(await verifyBody(
      env.INTERNAL_HMAC_SECRET,
      body,
      req.headers.get("x-gh-ts"),
      req.headers.get("x-gh-sig"),
    ))
  ) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }
  const parsed = createRoomRequest.safeParse(JSON.parse(body));
  if (!parsed.success || !gameFor(parsed.data.game)) return json({ error: "BAD_REQUEST" }, 400);

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const stub = env.Room.getByName(code, { locationHint: "weur" });
    const res = await stub.fetch("https://room/init", {
      method: "POST",
      headers: { "x-gh-internal": "init" },
      body: JSON.stringify({ ...parsed.data, code }),
    });
    if (res.status === 201) return json({ roomId: code, code }, 201);
    if (res.status !== 409) return json({ error: "INIT_FAILED" }, 502); // 409 = code in use, try another
  }
  return json({ error: "NO_CODE" }, 503);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/health" && req.method === "GET") return json({ ok: true });
    if (url.pathname === "/rooms" && req.method === "POST") return createPrivateRoom(req, env);

    const routed = await routePartykitRequest(req, env, {
      locationHint: "weur",
      // Plain HTTP to a room is never allowed from outside; rooms are created via POST /rooms.
      onBeforeRequest: () => new Response("Not found", { status: 404 }),
      onBeforeConnect: async (r, lobby) => {
        if (lobby.className !== "Room") return new Response("Not found", { status: 404 });
        if (!originAllowed(r, env)) return new Response("Forbidden", { status: 403 });
        const claims = await verifyTicket(r, env, `room:${lobby.name}`);
        if (!claims) return new Response("Unauthorized", { status: 401 });
        const headers = new Headers(r.headers);
        headers.set(CLAIMS_HEADER, JSON.stringify(claims)); // overwrites anything the client sent
        return new Request(r, { headers });
      },
    });
    return routed ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
