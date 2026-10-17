import type { ServerPresenceMsg, ServerRoomMsg } from "@gamehub/protocol";
import { signBody } from "@gamehub/protocol/hmac";
import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

const ORIGIN = "http://game.test";
const BASE = "https://realtime.test";

const ticket = (sub: string, scope: string) =>
  new SignJWT({ name: sub, avatar: null, scope })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setAudience("gamehub-realtime")
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(env.REALTIME_TICKET_SECRET));

type Msg = ServerPresenceMsg | ServerRoomMsg;
type Client = {
  msgs: Msg[];
  send: (m: unknown) => void;
  next: <T extends Msg>(pred: (m: Msg) => m is T, label: string) => Promise<T>;
  close: () => void;
};

async function connect(path: string, sub: string, scope: string): Promise<Client> {
  const res = await exports.default.fetch(
    `${BASE}/parties/${path}?ticket=${await ticket(sub, scope)}`,
    {
      headers: { Upgrade: "websocket", Origin: ORIGIN },
    },
  );
  const ws = res.webSocket;
  if (!ws) throw new Error(`no socket: ${res.status}`);
  ws.accept();
  const msgs: Msg[] = [];
  let cursor = 0;
  ws.addEventListener("message", (e) => msgs.push(JSON.parse(e.data as string) as Msg));
  return {
    msgs,
    send: (m) => ws.send(JSON.stringify(m)),
    async next(pred, label) {
      const deadline = Date.now() + 5000;
      for (;;) {
        const i = msgs.findIndex((m, idx) => idx >= cursor && pred(m));
        if (i >= 0) {
          cursor = i + 1;
          return msgs[i] as never;
        }
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
        await new Promise((r) => setTimeout(r, 25));
      }
    },
    close: () => ws.close(),
  };
}

const presence = (sub: string) => connect("presence/global", sub, "presence");
type Update = Extract<ServerPresenceMsg, { t: "p_update" }>;
const update =
  (id: string, ok: (u: Update) => boolean) =>
  (m: Msg): m is Update =>
    m.t === "p_update" && m.userId === id && ok(m);

async function signed(path: string, payload: unknown) {
  const body = JSON.stringify(payload);
  const { ts, sig } = await signBody(env.INTERNAL_HMAC_SECRET, body);
  return exports.default.fetch(`${BASE}${path}`, {
    method: "POST",
    body,
    headers: { "x-gh-ts": ts, "x-gh-sig": sig, "content-type": "application/json" },
  });
}

describe("presence", () => {
  it("friends see each other come and go, and when they're in a game", async () => {
    const a = await presence("u-pa");
    a.send({ t: "p_watch", userIds: ["u-pb"] });
    const first = await a.next(
      (m): m is Extract<ServerPresenceMsg, { t: "p_status" }> => m.t === "p_status",
      "status",
    );
    expect(first.statuses["u-pb"]).toEqual({ online: false, inGame: null, inTournament: null });
    const b = await presence("u-pb");
    await a.next(
      update("u-pb", (u) => u.status.online),
      "b online",
    );

    // A room says b is playing (rooms report at the start and end of each game).
    const res = await env.Presence.getByName("global").fetch("https://presence/status", {
      method: "POST",
      headers: { "x-gh-internal": "status" },
      body: JSON.stringify({
        userIds: ["u-pb"],
        inGame: { game: "ludo", code: "ABC234", kind: "private" },
      }),
    });
    expect(res.status).toBe(200);
    await a.next(
      update("u-pb", (u) => u.status.inGame?.code === "ABC234"),
      "in a game",
    );
    b.close();
    await a.next(
      update("u-pb", (u) => !u.status.online),
      "b offline",
    );
  });

  it("invites come signed from web, to every tab of the friend", async () => {
    const c = await presence("u-pc");
    const invite = {
      to: "u-pc",
      from: { id: "u-pd", name: "dayo", avatar: null },
      kind: "room",
      code: "WXY234",
      game: "whot",
      name: null,
    };
    const unsigned = await exports.default.fetch(`${BASE}/presence/invite`, {
      method: "POST",
      body: JSON.stringify(invite),
    });
    expect(unsigned.status).toBe(401);
    const res = await signed("/presence/invite", invite);
    expect(await res.json()).toEqual({ delivered: true });
    const got = await c.next(
      (m): m is Extract<ServerPresenceMsg, { t: "p_invite" }> => m.t === "p_invite",
      "invite",
    );
    expect(got.invite).toMatchObject({ code: "WXY234", game: "whot", from: { name: "dayo" } });
    expect(got.invite.expiresAt).toBeGreaterThan(Date.now() + 100_000);
    // Nobody online: not delivered (web tells the sender).
    const away = await signed("/presence/invite", { ...invite, to: "u-nobody" });
    expect(await away.json()).toEqual({ delivered: false });
  });

  it("a real game: friends see the host playing; players see how many watch", async () => {
    const payload = JSON.stringify({
      game: "tictactoe",
      rules: null,
      botLevel: "easy",
      firstPlayer: "seat1",
      seatBotsNow: true,
      players: 2,
      host: { userId: "u-ph", name: "host", avatar: null },
    });
    const { ts, sig } = await signBody(env.INTERNAL_HMAC_SECRET, payload);
    const made = await exports.default.fetch(`${BASE}/rooms`, {
      method: "POST",
      body: payload,
      headers: { "x-gh-ts": ts, "x-gh-sig": sig, "content-type": "application/json" },
    });
    const { code } = (await made.json()) as { code: string };
    const friend = await presence("u-pf");
    friend.send({ t: "p_watch", userIds: ["u-ph"] });
    const host = await connect(`room/${code}`, "u-ph", `room:${code}`);
    host.send({ t: "hello" });
    host.send({ t: "start" });
    await host.next(
      (m): m is Extract<ServerRoomMsg, { t: "snapshot" }> =>
        m.t === "snapshot" && m.room.phase === "playing",
      "playing",
    );
    await friend.next(
      update("u-ph", (u) => u.status.inGame?.code === code),
      "host in a game",
    );
    const watcher = await connect(`room/${code}`, "u-pw", `room:${code}`);
    watcher.send({ t: "hello" });
    await host.next(
      (m): m is Extract<ServerRoomMsg, { t: "snapshot" }> =>
        m.t === "snapshot" && m.room.spectators === 1,
      "1 watching",
    );
    watcher.close();
    await host.next(
      (m): m is Extract<ServerRoomMsg, { t: "snapshot" }> =>
        m.t === "snapshot" && m.room.spectators === 0,
      "nobody watching",
    );
  });
});
