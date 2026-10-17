import type { ChessState } from "@gamehub/engine";
import type { ServerMatchMsg, ServerRoomMsg } from "@gamehub/protocol";
import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
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

type Msg = ServerMatchMsg | ServerRoomMsg;
type Client = {
  msgs: Msg[];
  send: (m: unknown) => void;
  next: <T extends Msg>(pred: (m: Msg) => m is T, label: string, ms?: number) => Promise<T>;
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
    async next(pred, label, ms = 5000) {
      const deadline = Date.now() + ms;
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

const queueSocket = (sub: string) => connect("match/global", sub, "match:global");
const roomSocket = (code: string, sub: string) => connect(`room/${code}`, sub, `room:${code}`);

type State = Extract<ServerMatchMsg, { t: "mm_state" }>;
const state =
  (pred: (s: State) => boolean) =>
  (m: Msg): m is State =>
    m.t === "mm_state" && pred(m);
const go = (m: Msg): m is Extract<ServerMatchMsg, { t: "mm_go" }> => m.t === "mm_go";
type Snap = Extract<ServerRoomMsg, { t: "snapshot" }>;
const snap =
  (pred: (s: Snap) => boolean) =>
  (m: Msg): m is Snap =>
    m.t === "snapshot" && pred(m);

/** Catches results posted to web. */
function catchResults() {
  const posts: Array<Record<string, unknown>> = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("http://web.test")) return real(input, init);
    posts.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({ ok: true });
  }) as typeof fetch;
  return { posts, restore: () => (globalThis.fetch = real) };
}

const mm = () => env.Match.getByName("global");
/** Pretends everyone in the queues joined `ms` earlier, then runs the alarm. */
async function age(ms: number) {
  await runInDurableObject(mm(), (_i, st) => {
    const row = st.storage.sql.exec<{ json: string }>("SELECT json FROM mm").one();
    const m = JSON.parse(row.json) as {
      queues: Record<string, { waiting: Array<{ joinedAt: number }> }>;
    };
    for (const q of Object.values(m.queues)) for (const w of q.waiting) w.joinedAt -= ms;
    st.storage.sql.exec("UPDATE mm SET json = ? WHERE id = 1", JSON.stringify(m));
    (_i as unknown as { m: unknown }).m = m;
  });
  await runDurableObjectAlarm(mm());
}

const blitz = { game: "chess", players: 2, timeControl: { baseSeconds: 180, incrementSeconds: 2 } };

describe("quick match", () => {
  it("two people in the same queue: a ranked room; busy until it ends; the result goes to web", async () => {
    const web = catchResults();
    try {
      const a = await queueSocket("u-qa");
      const b = await queueSocket("u-qb");
      a.send({ t: "mm_join", queue: blitz });
      await a.next(
        state((s) => s.status === "queued"),
        "a queued",
      );
      b.send({ t: "mm_join", queue: blitz });
      const ga = await a.next(go, "a matched");
      const gb = await b.next(go, "b matched");
      expect(ga.code).toBe(gb.code);
      expect(ga.ranked).toBe(true);
      // One game at a time: joining anything now says you're busy.
      a.send({ t: "mm_join", queue: { game: "whot", players: 4 } });
      await a.next(
        state((s) => s.status === "busy"),
        "busy",
      );

      const ra = await roomSocket(ga.code, "u-qa");
      const rb = await roomSocket(ga.code, "u-qb");
      ra.send({ t: "hello" });
      rb.send({ t: "hello" });
      const playing = await ra.next(
        snap((s) => s.room.phase === "playing"),
        "started",
      );
      expect(playing.room.kind).toBe("quick");
      expect(playing.room.quick).toMatchObject({
        ranked: true,
        variant: "blitz",
        timeControl: "3+2",
      });
      expect((playing.room.rules as { takebacks: boolean }).takebacks).toBe(false);
      // Whoever is White resigns at once.
      const white = (playing.view as ChessState).white;
      const resigner = playing.you === white ? ra : rb;
      resigner.send({ t: "act", id: "r1", v: playing.v, a: { type: "resign" } });
      await ra.next(
        snap((s) => s.room.phase === "ended"),
        "ended",
      );
      const deadline = Date.now() + 5000;
      while (!web.posts.length && Date.now() < deadline)
        await new Promise((r) => setTimeout(r, 50));
      expect(web.posts).toHaveLength(1);
      expect(web.posts[0]).toMatchObject({
        kind: "quick",
        ranked: true,
        variant: "blitz",
        game: "chess",
      });
      const players = web.posts[0]?.players as Array<{ place: number; userId: string }>;
      expect(players.map((p) => p.place).sort()).toEqual([1, 2]);
      // The room tells the matchmaker they're free.
      a.send({ t: "mm_hello" });
      await a.next(
        state((s) => s.status === "idle"),
        "free again",
      );
    } finally {
      web.restore();
    }
  });

  it("alone for 20 s: bots take the seats (unranked); keep waiting holds off, then gives up at 3 min", async () => {
    const c = await queueSocket("u-qc");
    c.send({ t: "mm_join", queue: { game: "whot", players: 4 } });
    const q = await c.next(
      state((s) => s.status === "queued"),
      "queued",
    );
    expect(q.status === "queued" && q.botsAt).toBe(q.status === "queued" ? q.joinedAt + 20_000 : 0);
    await age(21_000);
    const g = await c.next(go, "bots filled");
    expect(g.ranked).toBe(false);
    const r = await roomSocket(g.code, "u-qc");
    r.send({ t: "hello" });
    const s = await r.next(
      snap(() => true),
      "room",
    );
    expect(s.seats.filter((x) => x.status === "bot")).toHaveLength(3);
    expect(s.room.quick?.ranked).toBe(false);

    const d = await queueSocket("u-qd");
    d.send({ t: "mm_join", queue: { game: "ludo", players: 4 } });
    await d.next(
      state((s) => s.status === "queued"),
      "queued",
    );
    d.send({ t: "mm_wait", keep: true });
    await d.next(
      state((s) => s.status === "queued" && s.botsAt === null && s.giveUpAt !== null),
      "keep",
    );
    await age(30_000);
    await d.next(
      state((s) => s.status === "queued"),
      "still waiting",
    );
    expect(d.msgs.some(go)).toBe(false);
    await age(200_000);
    await d.next(
      state((s) => s.status === "timed_out"),
      "gave up",
    );
  });

  it("one queue at a time; leaving the page leaves the queue; bad queues are refused", async () => {
    const e = await queueSocket("u-qe");
    e.send({ t: "mm_join", queue: { game: "snakes", players: 8 } });
    await e.next(
      state((s) => s.status === "queued" && s.queue === "snakes-8"),
      "snakes",
    );
    e.send({ t: "mm_join", queue: { game: "rps", players: 8 } });
    await e.next(
      state((s) => s.status === "queued" && s.queue === "rps-8"),
      "moved to rps",
    );
    e.send({ t: "mm_join", queue: { game: "chess", players: 2, timeControl: null } });
    await e.next(
      (m): m is Extract<ServerMatchMsg, { t: "error" }> =>
        m.t === "error" && m.code === "BAD_QUEUE",
      "no clock refused",
    );
    e.close();
    const f = await queueSocket("u-qf");
    f.send({ t: "mm_join", queue: { game: "rps", players: 8 } });
    const s = await f.next(
      state((x) => x.status === "queued"),
      "f queued",
    );
    expect(s.status === "queued" && s.found).toHaveLength(1);
  });

  it("ranked chess: no bot for someone who leaves; once their grace is over the other claims the win", async () => {
    const web = catchResults();
    try {
      const a = await queueSocket("u-qg");
      const b = await queueSocket("u-qh");
      a.send({ t: "mm_join", queue: blitz });
      await a.next(
        state((s) => s.status === "queued"),
        "queued",
      );
      b.send({ t: "mm_join", queue: blitz });
      const { code } = await a.next(go, "matched");
      const ra = await roomSocket(code, "u-qg");
      const rb = await roomSocket(code, "u-qh");
      ra.send({ t: "hello" });
      rb.send({ t: "hello" });
      await ra.next(
        snap((s) => s.room.phase === "playing"),
        "playing",
      );
      rb.close();
      // GRACE_MS is 150 in tests: the alarm marks them gone (no bot).
      await new Promise((r) => setTimeout(r, 300));
      await runDurableObjectAlarm(env.Room.getByName(code));
      const gone = await ra.next(
        snap((s) => !!(s.view as ChessState).gone),
        "gone",
      );
      expect(gone.seats.find((x) => x.userId === "u-qh")?.status).toBe("away");
      ra.send({ t: "act", id: "c1", v: gone.v, a: { type: "claim_victory" } });
      const end = await ra.next(
        snap((s) => s.room.phase === "ended"),
        "claimed",
      );
      expect((end.view as ChessState).result?.reason).toBe("claim_win");
    } finally {
      web.restore();
    }
  });
});
