import type { ServerPresenceMsg, ServerRoomMsg } from "@gamehub/protocol";
import { signBody } from "@gamehub/protocol/hmac";
import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

const ORIGIN = "http://game.test";
const BASE = "https://realtime.test";

const ticket = (sub: string, scope: string, extra: Record<string, unknown> = {}) =>
  new SignJWT({ name: sub, avatar: null, scope, ...extra })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setAudience("gamehub-realtime")
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(env.REALTIME_TICKET_SECRET));

type Msg = ServerRoomMsg | ServerPresenceMsg;
type Client = {
  msgs: Msg[];
  send: (m: unknown) => void;
  next: <T extends Msg>(pred: (m: Msg) => m is T, label: string) => Promise<T>;
  closed: Promise<number>;
};

async function connect(
  path: string,
  sub: string,
  scope: string,
  extra: Record<string, unknown> = {},
): Promise<Client> {
  const t = await ticket(sub, scope, extra);
  const res = await exports.default.fetch(`${BASE}/parties/${path}?ticket=${t}`, {
    headers: { Upgrade: "websocket", Origin: ORIGIN },
  });
  const ws = res.webSocket;
  if (!ws) throw new Error(`no socket: ${res.status}`);
  ws.accept();
  const msgs: Msg[] = [];
  let cursor = 0;
  let done: (c: number) => void = () => {};
  const closed = new Promise<number>((r) => (done = r));
  ws.addEventListener("message", (e) => msgs.push(JSON.parse(e.data as string) as Msg));
  ws.addEventListener("close", (e) => done(e.code));
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
    closed,
  };
}

async function room(): Promise<string> {
  const payload = JSON.stringify({
    game: "whot",
    rules: null,
    botLevel: "easy",
    players: 4,
    host: { userId: "u-ch", name: "host", avatar: null },
  });
  const { ts, sig } = await signBody(env.INTERNAL_HMAC_SECRET, payload);
  const res = await exports.default.fetch(`${BASE}/rooms`, {
    method: "POST",
    body: payload,
    headers: { "x-gh-ts": ts, "x-gh-sig": sig, "content-type": "application/json" },
  });
  return ((await res.json()) as { code: string }).code;
}

type Chat = Extract<ServerRoomMsg, { t: "chat" }>;
const chat = (m: Msg): m is Chat => m.t === "chat";
const chatError =
  (code: string) =>
  (m: Msg): m is Extract<ServerRoomMsg, { t: "chat_error" }> =>
    m.t === "chat_error" && m.code === code;

/** Catches posts to web (reports). */
function catchWeb() {
  const posts: Array<{ url: string; body: Record<string, unknown> }> = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("http://web.test")) return real(input, init);
    posts.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return Response.json({ ok: true });
  }) as typeof fetch;
  return { posts, restore: () => (globalThis.fetch = real) };
}

describe("room chat", () => {
  it("lines are cleaned and signed; links refused; insults starred; blocked people's lines not sent", async () => {
    const code = await room();
    const host = await connect(`room/${code}`, "u-ch", `room:${code}`);
    const ada = await connect(`room/${code}`, "u-ca", `room:${code}`);
    // Bola has blocked Ada (from her ticket).
    const bola = await connect(`room/${code}`, "u-cb", `room:${code}`, { blocked: ["u-ca"] });
    for (const c of [host, ada, bola]) c.send({ t: "hello" });
    await host.next(
      (m): m is Extract<ServerRoomMsg, { t: "chat_state" }> => m.t === "chat_state",
      "chat state",
    );

    ada.send({ t: "chat", text: "who dey  play\nnext? call 08031234567" });
    const got = await host.next(chat, "line");
    expect(got.text).toBe("who dey play next? call •••••••••••");
    expect(got.from).toEqual({ userId: "u-ca", name: "u-ca" });
    expect(got.sig).toMatch(/^[0-9a-f]{64}$/);
    await new Promise((r) => setTimeout(r, 2100));
    ada.send({ t: "chat", text: "see www.example.com" });
    await ada.next(chatError("LINK"), "links refused");
    await new Promise((r) => setTimeout(r, 2100));
    ada.send({ t: "chat", text: "you be mumu" });
    expect((await host.next(chat, "starred")).text).toBe("you be ****");
    ada.send({ t: "chat", text: "too fast" });
    await ada.next(chatError("SLOW"), "one line per 2 s");
    // Bola never got Ada's lines; emotes from Ada aren't sent to her either.
    ada.send({ t: "emote", id: "wahala" });
    await host.next(
      (m): m is Extract<ServerRoomMsg, { t: "emote" }> => m.t === "emote" && m.id === "wahala",
      "emote",
    );
    await new Promise((r) => setTimeout(r, 200));
    expect(bola.msgs.some((m) => m.t === "chat" || m.t === "emote")).toBe(false);
  }, 20_000);

  it("a muted account can't chat; the host can turn chat off", async () => {
    const code = await room();
    const host = await connect(`room/${code}`, "u-ch", `room:${code}`);
    const muted = await connect(`room/${code}`, "u-cm", `room:${code}`, {
      chatMutedUntil: Date.now() + 60_000,
    });
    host.send({ t: "hello" });
    muted.send({ t: "hello" });
    const st = await muted.next(
      (m): m is Extract<ServerRoomMsg, { t: "chat_state" }> => m.t === "chat_state",
      "state",
    );
    expect(st.mutedUntil).toBeGreaterThan(Date.now());
    muted.send({ t: "chat", text: "hello" });
    await muted.next(chatError("MUTED"), "muted");
    host.send({
      t: "config",
      game: "whot",
      rules: (
        await host.next(
          (m): m is Extract<ServerRoomMsg, { t: "snapshot" }> => m.t === "snapshot",
          "snap",
        )
      ).room.rules,
      players: 4,
      botLevel: "easy",
      firstPlayer: "random",
      chat: false,
    });
    await host.next(
      (m): m is Extract<ServerRoomMsg, { t: "snapshot" }> =>
        m.t === "snapshot" && m.room.chat === false,
      "chat off",
    );
    host.send({ t: "chat", text: "hello" });
    await host.next(chatError("OFF"), "off");
  });

  it("a report goes to web with the line only if its signature is real", async () => {
    const web = catchWeb();
    try {
      const code = await room();
      const host = await connect(`room/${code}`, "u-ch", `room:${code}`);
      const rude = await connect(`room/${code}`, "u-cr", `room:${code}`);
      host.send({ t: "hello" });
      rude.send({ t: "hello" });
      rude.send({ t: "chat", text: "werey" });
      const line = await host.next(chat, "line");
      host.send({
        t: "report",
        target: "u-cr",
        reason: "abuse",
        line: { text: line.text, ts: line.ts, sig: line.sig },
      });
      await host.next(chatError("REPORTED"), "reported");
      host.send({
        t: "report",
        target: "u-cr",
        reason: "abuse",
        line: { text: "something they never said", ts: line.ts, sig: line.sig },
      });
      await host.next(chatError("REPORTED"), "reported again");
      const deadline = Date.now() + 5000;
      while (
        web.posts.filter((p) => p.url.endsWith("/api/internal/report")).length < 2 &&
        Date.now() < deadline
      )
        await new Promise((r) => setTimeout(r, 50));
      const reports = web.posts
        .filter((p) => p.url.endsWith("/api/internal/report"))
        .map((p) => p.body);
      expect(reports[0]).toMatchObject({
        reporterId: "u-ch",
        targetId: "u-cr",
        reason: "abuse",
        message: "*****",
      });
      expect(reports[1]?.message).toBeNull();
    } finally {
      web.restore();
    }
  });
});

describe("bans", () => {
  it("a ban closes the person's presence and room sockets", async () => {
    const code = await room();
    const p = await connect("presence/global", "u-cbad", "presence");
    const r = await connect(`room/${code}`, "u-cbad", `room:${code}`);
    r.send({ t: "hello" });
    await r.next((m): m is Extract<ServerRoomMsg, { t: "snapshot" }> => m.t === "snapshot", "in");
    // Presence knows they're at this table.
    await env.Presence.getByName("global").fetch("https://presence/status", {
      method: "POST",
      headers: { "x-gh-internal": "status" },
      body: JSON.stringify({
        userIds: ["u-cbad"],
        inGame: { game: "whot", code, kind: "private" },
      }),
    });
    const body = JSON.stringify({ userId: "u-cbad" });
    const { ts, sig } = await signBody(env.INTERNAL_HMAC_SECRET, body);
    const res = await exports.default.fetch(`${BASE}/moderation/kick`, {
      method: "POST",
      body,
      headers: { "x-gh-ts": ts, "x-gh-sig": sig },
    });
    expect(res.status).toBe(200);
    expect(await p.closed).toBe(4010);
    expect(await r.closed).toBe(4010);
  });
});
