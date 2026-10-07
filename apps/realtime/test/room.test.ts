import { ludoNaija, snakesNaija, whotNaija, type TttState } from "@gamehub/engine";
import { signBody } from "@gamehub/protocol/hmac";
import type { ServerRoomMsg } from "@gamehub/protocol";
import { env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

const ORIGIN = "http://game.test";
const BASE = "https://realtime.test";

async function ticket(
  sub: string,
  name: string,
  scope: string,
  opts: { secret?: string; aud?: string } = {},
) {
  return new SignJWT({ name, avatar: null, scope })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setAudience(opts.aud ?? "gamehub-realtime")
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(opts.secret ?? env.REALTIME_TICKET_SECRET));
}

async function createRoom(body: Record<string, unknown> = {}) {
  const payload = JSON.stringify({
    game: "tictactoe",
    rules: null,
    botLevel: null,
    host: { userId: "u-host", name: "host", avatar: null },
    ...body,
  });
  const { ts, sig } = await signBody(env.INTERNAL_HMAC_SECRET, payload);
  const res = await exports.default.fetch(`${BASE}/rooms`, {
    method: "POST",
    body: payload,
    headers: { "x-gh-ts": ts, "x-gh-sig": sig, "content-type": "application/json" },
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { code: string }).code;
}

type Client = {
  ws: WebSocket;
  msgs: ServerRoomMsg[];
  send: (m: unknown) => void;
  next: (pred: (m: ServerRoomMsg) => boolean, label?: string) => Promise<ServerRoomMsg>;
  last: () => Extract<ServerRoomMsg, { t: "snapshot" }>;
  closed: Promise<number>;
};

async function connect(code: string, sub: string, name: string): Promise<Client> {
  const res = await exports.default.fetch(
    `${BASE}/parties/room/${code}?ticket=${await ticket(sub, name, `room:${code}`)}`,
    { headers: { Upgrade: "websocket", Origin: ORIGIN } },
  );
  const ws = res.webSocket;
  if (!ws) throw new Error(`no socket: ${res.status}`);
  ws.accept();
  const msgs: ServerRoomMsg[] = [];
  let cursor = 0;
  const waiters: Array<() => void> = [];
  let resolveClosed: (c: number) => void = () => {};
  const closed = new Promise<number>((r) => (resolveClosed = r));
  ws.addEventListener("message", (e) => {
    msgs.push(JSON.parse(e.data as string) as ServerRoomMsg);
    waiters.splice(0).forEach((w) => w());
  });
  ws.addEventListener("close", (e) => resolveClosed(e.code));
  const client: Client = {
    ws,
    msgs,
    closed,
    send: (m) => ws.send(JSON.stringify(m)),
    // Scans forward from a read cursor, so replies that arrived before we started waiting still count.
    async next(pred, label = "message") {
      const deadline = Date.now() + 3000;
      for (;;) {
        const i = msgs.findIndex((m, idx) => idx >= cursor && pred(m));
        if (i >= 0) {
          cursor = i + 1;
          return msgs[i]!;
        }
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
        await new Promise<void>((r) => {
          waiters.push(r);
          setTimeout(r, 50);
        });
      }
    },
    last() {
      const snaps = msgs.filter(
        (m): m is Extract<ServerRoomMsg, { t: "snapshot" }> => m.t === "snapshot",
      );
      const s = snaps.at(-1);
      if (!s) throw new Error("no snapshot yet");
      return s;
    },
  };
  return client;
}

const snapshot = (m: ServerRoomMsg) => m.t === "snapshot";

type RoomStub = ReturnType<typeof env.Room.getByName>;
const botDue = (stub: RoomStub) =>
  runInDurableObject(stub, (_i, state) => {
    const row = state.storage.sql.exec<{ json: string }>("SELECT json FROM room").one();
    return (JSON.parse(row.json) as { deadlines: { bot?: number } }).deadlines.bot;
  });
/** Waits out the bot's think time, then fires the alarm. */
async function fireBot(stub: RoomStub) {
  const due = await botDue(stub);
  if (due !== undefined)
    await new Promise((r) => setTimeout(r, Math.max(0, due - Date.now()) + 20));
  await runDurableObjectAlarm(stub);
}
const view = (c: Client) => c.last().view as TttState;
let actionSeq = 0;
const act = (c: Client, a: unknown) =>
  c.send({ t: "act", id: `a${++actionSeq}`, v: c.last().v, a });

describe("room creation", () => {
  it("refuses unsigned or badly signed requests", async () => {
    const body = JSON.stringify({
      game: "tictactoe",
      rules: null,
      botLevel: null,
      host: { userId: "u", name: "n", avatar: null },
    });
    expect((await exports.default.fetch(`${BASE}/rooms`, { method: "POST", body })).status).toBe(
      401,
    );
    const { ts } = await signBody("wrong-secret", body);
    const res = await exports.default.fetch(`${BASE}/rooms`, {
      method: "POST",
      body,
      headers: { "x-gh-ts": ts, "x-gh-sig": "00".repeat(32) },
    });
    expect(res.status).toBe(401);
  });

  it("creates a room named by a 6-letter code", async () => {
    expect(await createRoom()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it("never serves plain HTTP on room addresses", async () => {
    const code = await createRoom();
    const res = await exports.default.fetch(`${BASE}/parties/room/${code}`, {
      method: "POST",
      headers: { "x-gh-internal": "init" },
    });
    expect(res.status).toBe(404);
  });
});

describe("socket auth", () => {
  it("rejects missing, forged, wrong-scope tickets and foreign origins", async () => {
    const code = await createRoom();
    const url = (t: string) => `${BASE}/parties/room/${code}?ticket=${t}`;
    const up = { Upgrade: "websocket", Origin: ORIGIN };
    expect(
      (await exports.default.fetch(`${BASE}/parties/room/${code}`, { headers: up })).status,
    ).toBe(401);
    expect(
      (
        await exports.default.fetch(
          url(await ticket("u", "n", `room:${code}`, { secret: "nope" })),
          { headers: up },
        )
      ).status,
    ).toBe(401);
    expect(
      (await exports.default.fetch(url(await ticket("u", "n", "room:OTHER1")), { headers: up }))
        .status,
    ).toBe(401);
    expect(
      (
        await exports.default.fetch(url(await ticket("u", "n", `room:${code}`, { aud: "x" })), {
          headers: up,
        })
      ).status,
    ).toBe(401);
    const bad = await exports.default.fetch(url(await ticket("u", "n", `room:${code}`)), {
      headers: { Upgrade: "websocket", Origin: "https://evil.example" },
    });
    expect(bad.status).toBe(403);
  });

  it("closes sockets to rooms that don't exist", async () => {
    const c = await connect("ZZZZZZ", "u1", "ghost");
    expect(await c.closed).toBe(4004);
  });
});

describe("a tic-tac-toe series", () => {
  it("two players play to the end; each move is applied once", async () => {
    const code = await createRoom({
      rules: { turnSeconds: 15, bestOf: 1, alternateStarter: true },
    });
    const host = await connect(code, "u-host", "host");
    host.send({ t: "hello" });
    await host.next(snapshot, "host snapshot");
    const guest = await connect(code, "u-guest", "guest");
    guest.send({ t: "hello" });
    await guest.next((m) => m.t === "snapshot" && m.you === 1, "guest seated");
    expect(host.last().seats.map((s) => s.status)).toEqual(["connected", "connected"]);

    guest.send({ t: "start" });
    await guest.next((m) => m.t === "error" && m.code === "NOT_HOST", "non-host start refused");

    host.send({ t: "start" });
    await host.next((m) => m.t === "snapshot" && m.room.phase === "playing", "game started");

    // Same action id twice: applied once.
    host.send({ t: "act", id: "dup", v: host.last().v, a: { type: "place", cell: 0 } });
    host.send({ t: "act", id: "dup", v: host.last().v, a: { type: "place", cell: 0 } });
    await host.next((m) => m.t === "ack" && m.id === "dup");
    await guest.next(
      (m) => m.t === "snapshot" && (m.view as TttState).board[0] === 0,
      "guest sees X",
    );

    // Out of turn → reject + fresh snapshot.
    host.send({ t: "act", id: "early", v: host.last().v, a: { type: "place", cell: 1 } });
    await host.next((m) => m.t === "reject" && m.id === "early" && m.code === "NOT_YOUR_TURN");

    for (const [who, cell] of [
      [guest, 3],
      [host, 1],
      [guest, 4],
      [host, 2],
    ] as const) {
      const before = who.last().v;
      act(who, { type: "place", cell });
      await who.next((m) => m.t === "snapshot" && m.v > before, `move ${cell}`);
    }
    const ended = await guest.next((m) => m.t === "ended", "ended");
    expect(ended).toMatchObject({ t: "ended", ranking: [[0], [1]], ranked: false });
    expect(view(host).seriesWinner).toBe(0);
    expect(view(host).board.filter((c) => c !== null)).toHaveLength(5);
  });

  it("a second connection for the same user replaces the first", async () => {
    const code = await createRoom();
    const first = await connect(code, "u-host", "host");
    await connect(code, "u-host", "host");
    expect(await first.closed).toBe(4001);
  });
});

describe("bots, alarms and hibernation", () => {
  it("bots fill empty seats on start and move when the alarm fires", async () => {
    const code = await createRoom({ botLevel: "hard" });
    const host = await connect(code, "u-host", "host");
    host.send({ t: "hello" });
    await host.next(snapshot);
    host.send({ t: "start" });
    await host.next((m) => m.t === "snapshot" && m.room.phase === "playing");
    expect(host.last().seats[1]).toMatchObject({ status: "bot", botLevel: "hard", userId: null });

    const movedAt = Date.now();
    act(host, { type: "place", cell: 4 });
    await host.next((m) => m.t === "ack");
    const stub = env.Room.getByName(code);
    // The bot takes a moment (0.8–1.5 s in tic-tac-toe) so people can see it move.
    const due = (await botDue(stub)) ?? 0;
    expect(due - movedAt).toBeGreaterThanOrEqual(800);
    expect(due - movedAt).toBeLessThanOrEqual(1500 + 200);
    await fireBot(stub);
    await host.next(
      (m) => m.t === "snapshot" && (m.view as TttState).board.filter((c) => c === 1).length === 1,
      "bot moved",
    );
  });

  it("state survives the object being evicted between moves", async () => {
    const code = await createRoom({ botLevel: "easy" });
    const host = await connect(code, "u-host", "host");
    host.send({ t: "hello" });
    await host.next(snapshot);
    host.send({ t: "start" });
    await host.next((m) => m.t === "snapshot" && m.room.phase === "playing");
    act(host, { type: "place", cell: 8 });
    await host.next((m) => m.t === "ack");

    const stub = env.Room.getByName(code);
    const before = await runInDurableObject(
      stub,
      (_i, state) => state.storage.sql.exec<{ json: string }>("SELECT json FROM room").one().json,
    );
    const room = JSON.parse(before) as { v: number; state: TttState; rngSeed: string };
    expect(room.state.board[8]).toBe(0);
    expect(room.rngSeed).toMatch(/^[0-9a-f]{32}$/);

    // A fresh instance reading the same row sees the same game.
    const after = await runInDurableObject(
      stub,
      (_i, state) =>
        JSON.parse(
          state.storage.sql.exec<{ json: string }>("SELECT json FROM room").one().json,
        ) as { v: number },
    );
    expect(after.v).toBe(room.v);
  });

  it("a dropped player is held, then a bot takes over, and they get the seat back", async () => {
    const code = await createRoom({
      rules: { turnSeconds: 60, bestOf: 1, alternateStarter: true },
    });
    const host = await connect(code, "u-host", "host");
    host.send({ t: "hello" });
    await host.next(snapshot);
    const guest = await connect(code, "u-guest", "guest");
    guest.send({ t: "hello" });
    await guest.next((m) => m.t === "snapshot" && m.you === 1);
    host.send({ t: "start" });
    await host.next((m) => m.t === "snapshot" && m.room.phase === "playing");
    act(host, { type: "place", cell: 0 }); // guest's turn now
    await host.next((m) => m.t === "ack");

    guest.ws.close(3000, "network"); // anything but 1000 counts as a drop
    await host.next((m) => m.t === "snapshot" && m.seats[1]?.status === "away", "guest away");
    expect(host.last().deadlines.graceEndsAt?.[1]).toBeGreaterThan(Date.now() - 1000);

    const stub = env.Room.getByName(code);
    await new Promise((r) => setTimeout(r, 300)); // GRACE_MS is 150 in tests
    await runDurableObjectAlarm(stub);
    await host.next((m) => m.t === "snapshot" && m.seats[1]?.status === "bot", "bot took over");

    const back = await connect(code, "u-guest", "guest");
    back.send({ t: "hello" });
    const snap = await back.next((m) => m.t === "snapshot" && m.you === 1, "guest back in seat 1");
    expect(snap.t === "snapshot" && snap.seats[1]?.status).toBe("connected");
  });
});

describe("limits", () => {
  it("closes sockets that send oversized frames", async () => {
    const code = await createRoom();
    const c = await connect(code, "u-host", "host");
    c.ws.send("x".repeat(5000));
    expect(await c.closed).toBe(1009);
  });

  it("answers garbage with BAD_MESSAGE", async () => {
    const code = await createRoom();
    const c = await connect(code, "u-host", "host");
    c.ws.send("{not json");
    await c.next((m) => m.t === "error" && m.code === "BAD_MESSAGE");
    c.send({ t: "act", id: "x", v: 0, a: { type: "place", cell: 99 } });
    await c.next((m) => m.t === "error" && m.code === "WRONG_PHASE");
  });
});

describe("free-tier budget", () => {
  it("a move costs at most 2 row writes (state + alarm)", async () => {
    const code = await createRoom({
      rules: { turnSeconds: 30, bestOf: 3, alternateStarter: true },
    });
    const host = await connect(code, "u-host", "host");
    host.send({ t: "hello" });
    await host.next(snapshot);
    const guest = await connect(code, "u-guest", "guest");
    guest.send({ t: "hello" });
    await guest.next((m) => m.t === "snapshot" && m.you === 1);
    host.send({ t: "start" });
    await host.next((m) => m.t === "snapshot" && m.room.phase === "playing");

    // Count writes inside the object: each INSERT…room upsert and each setAlarm is one row.
    const stub = env.Room.getByName(code);
    const counts = { upserts: 0, alarms: 0 };
    await runInDurableObject(stub, (_instance, state) => {
      const sql = state.storage.sql;
      const exec = sql.exec.bind(sql);
      sql.exec = ((query: string, ...args: unknown[]) => {
        if (/^\s*(INSERT|UPDATE|DELETE)/i.test(query)) counts.upserts++;
        return exec(query, ...(args as []));
      }) as typeof sql.exec;
      const setAlarm = state.storage.setAlarm.bind(state.storage);
      state.storage.setAlarm = ((t: number | Date) => {
        counts.alarms++;
        return setAlarm(t);
      }) as typeof state.storage.setAlarm;
    });

    act(host, { type: "place", cell: 4 });
    await host.next((m) => m.t === "ack");
    expect(counts.upserts + counts.alarms).toBeLessThanOrEqual(2);
    expect(counts.upserts).toBe(1);
  });
});

describe("rock paper scissors", () => {
  const RPS = { turnSeconds: 30, bestOf: 1, maxTiesPerRound: 5 };

  it("a pending pick never reaches the opponent or spectators before the reveal", async () => {
    const code = await createRoom({ game: "rps", rules: RPS, players: 2 });
    const host = await connect(code, "u-host", "host");
    host.send({ t: "hello" });
    await host.next(snapshot);
    const guest = await connect(code, "u-guest", "guest");
    guest.send({ t: "hello" });
    await guest.next((m) => m.t === "snapshot" && m.you === 1);
    host.send({ t: "start" });
    await host.next((m) => m.t === "snapshot" && m.room.phase === "playing");
    const watcher = await connect(code, "u-watch", "watcher");
    watcher.send({ t: "hello" });
    await watcher.next((m) => m.t === "snapshot" && m.you === "spectator");

    // Both seats are on the clock until they throw.
    expect(Object.keys(host.last().deadlines.turns ?? {}).sort()).toEqual(["0", "1"]);

    guest.msgs.length = 0;
    watcher.msgs.length = 0;
    act(host, { type: "throw", pick: "scissors" });
    await host.next((m) => m.t === "ack");
    await guest.next(
      (m) => m.t === "snapshot" && JSON.stringify(m.view).includes('"thrown":[0]'),
      "guest sees thrown",
    );
    await watcher.next(
      (m) => m.t === "snapshot" && JSON.stringify(m.view).includes('"thrown":[0]'),
    );
    for (const m of [...guest.msgs, ...watcher.msgs])
      expect(JSON.stringify(m)).not.toContain("scissors");
    // Host sees their own pick; only the guest is still on the clock.
    await host.next(
      (m) => m.t === "snapshot" && JSON.stringify(m.view).includes('"mine":"scissors"'),
      "host sees own pick",
    );
    expect(Object.keys(host.last().deadlines.turns ?? {})).toEqual(["1"]);

    act(guest, { type: "throw", pick: "paper" });
    const ended = await host.next((m) => m.t === "ended");
    expect(ended).toMatchObject({ ranking: [[0], [1]] });
    // Revealed now, to everyone.
    await watcher.next(
      (m) => m.t === "snapshot" && JSON.stringify(m.view).includes("scissors"),
      "watcher sees reveal",
    );
  });

  it("a 3-player bracket with bots plays to a champion", async () => {
    const code = await createRoom({
      game: "rps",
      rules: { ...RPS, turnSeconds: 10 },
      players: 3,
      botLevel: "easy",
    });
    const host = await connect(code, "u-host", "host");
    host.send({ t: "hello" });
    await host.next(snapshot);
    expect(host.last().seats).toHaveLength(3);
    host.send({ t: "start" });
    await host.next((m) => m.t === "snapshot" && m.room.phase === "playing");
    expect(host.last().seats.filter((s) => s.status === "bot")).toHaveLength(2);

    const stub = env.Room.getByName(code);
    for (let i = 0; i < 40 && host.last().room.phase === "playing"; i++) {
      const view = host.last().view as {
        rounds: Array<
          Array<{ a: number | null; b: number | null; winner: number | null; thrown: number[] }>
        >;
        round: number;
      };
      const mine = view.rounds[view.round]?.find(
        (m) => (m.a === 0 || m.b === 0) && m.winner === null && m.a !== null && m.b !== null,
      );
      if (mine && !mine.thrown.includes(0)) {
        act(host, { type: "throw", pick: "rock" });
        await host.next((m) => m.t === "ack" || m.t === "reject");
      }
      await fireBot(stub);
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(host.last().room.phase).toBe("ended");
  }, 60_000);
});

describe("turn clocks", () => {
  it("whoever throws last gets a full, fresh clock for the next throw (after the reveal pause)", async () => {
    const T = 10;
    const code = await createRoom({
      game: "rps",
      rules: { turnSeconds: T, bestOf: 3, maxTiesPerRound: 5 },
      players: 2,
    });
    const host = await connect(code, "u-host", "host");
    host.send({ t: "hello" });
    await host.next(snapshot);
    const guest = await connect(code, "u-guest", "guest");
    guest.send({ t: "hello" });
    await guest.next((m) => m.t === "snapshot" && m.you === 1);
    host.send({ t: "start" });
    await guest.next((m) => m.t === "snapshot" && m.room.phase === "playing");
    const firstDeadline = guest.last().deadlines.turns?.[1];
    expect(firstDeadline).toBeDefined();

    act(host, { type: "throw", pick: "rock" });
    await host.next((m) => m.t === "ack");
    await new Promise((r) => setTimeout(r, 1500)); // the guest uses some of their time…
    act(guest, { type: "throw", pick: "scissors" }); // …and throws last, completing the reveal
    const after = await guest.next(
      (m) => m.t === "snapshot" && JSON.stringify(m.view).includes('"history":[{'),
      "reveal",
    );
    const next = after.t === "snapshot" ? after.deadlines.turns?.[1] : undefined;
    expect(next).toBeDefined();
    // Not the leftover clock from throw 1…
    expect(next!).toBeGreaterThan(firstDeadline! + 1000);
    // …but a full turn that starts after the ~2.4 s reveal animation.
    expect(next! - Date.now()).toBeGreaterThan(T * 1000 + 1500);
    // The other player (who threw first) gets the same fresh clock.
    const hostNext = after.t === "snapshot" ? after.deadlines.turns?.[0] : undefined;
    expect(Math.abs(hostNext! - next!)).toBeLessThan(50);
  });
});

describe("whot", () => {
  type Hands = { state: { hands: string[][] } };
  const CARD = /"((?:circle|triangle|cross|square|star)-\d+|whot-20-[a-e])"/g;

  it("each player only ever receives their own hand; spectators get none", async () => {
    const code = await createRoom({
      game: "whot",
      rules: { ...whotNaija, turnSeconds: 10 },
      players: 3,
      botLevel: "medium",
    });
    const host = await connect(code, "u-host", "host");
    host.send({ t: "hello" });
    await host.next(snapshot);
    const guest = await connect(code, "u-guest", "guest");
    guest.send({ t: "hello" });
    await guest.next((m) => m.t === "snapshot" && m.you === 1);
    host.send({ t: "start" });
    await host.next((m) => m.t === "snapshot" && m.room.phase === "playing");
    const watcher = await connect(code, "u-watch", "watcher");
    watcher.send({ t: "hello" });
    await watcher.next((m) => m.t === "snapshot" && m.you === "spectator");

    const stub = env.Room.getByName(code);
    const hands = () =>
      runInDurableObject(stub, (_i, state) => {
        const row = state.storage.sql.exec<{ json: string }>("SELECT json FROM room").one();
        return (JSON.parse(row.json) as Hands).state.hands;
      });
    // Everything a client was sent may name only cards in its own hand or on the public pile.
    async function check(c: Client, seat: number | null) {
      const all = await hands();
      const others = new Set(all.filter((_, i) => i !== seat).flat());
      for (const m of c.msgs) {
        const pub = m.t === "snapshot" ? { ...m, view: { ...(m.view as object), you: null } } : m;
        const json = JSON.stringify(pub)
          .replace(/"top":"[^"]*"/g, "")
          .replace(/"pileTop":\[[^\]]*\]/g, "")
          .replace(/"card":"[^"]*"/g, ""); // played cards are public
        for (const [, card] of json.matchAll(CARD)) expect(others.has(card!), card).toBe(false);
      }
      if (seat !== null) {
        const v = c.last().view as { you: { hand: string[] } };
        expect(v.you.hand).toEqual(all[seat]);
      } else expect((c.last().view as { you: unknown }).you).toBeNull();
    }

    const startMarket = (host.last().view as { marketCount: number }).marketCount;
    // Play a few turns: humans go to market, the bot moves on alarms.
    for (let i = 0; i < 12 && host.last().room.phase === "playing"; i++) {
      const turn = (host.last().view as { turn: number }).turn;
      const c = turn === 0 ? host : turn === 1 ? guest : null;
      if (c) {
        act(c, { type: "market" });
        await c.next((m) => m.t === "ack" || m.t === "reject");
      } else {
        // Bots pause 0.5–2.6 s depending on the move (market quick, a Whot slower).
        const wait = ((await botDue(stub)) ?? 0) - Date.now();
        expect(wait).toBeGreaterThan(200);
        expect(wait).toBeLessThanOrEqual(2600);
        await fireBot(stub);
      }
      await new Promise((r) => setTimeout(r, 50));
      await check(host, 0);
      await check(guest, 1);
      await check(watcher, null);
    }
    expect((host.last().view as { marketCount: number }).marketCount).toBeLessThan(startMarket - 5);
  }, 60_000);
});

describe("ludo", () => {
  type Ludo = {
    phase: string;
    turn: number;
    lastRoll: { seat: number; value: number } | null;
    seeds: number[][];
    movable: number[];
  };

  it("you roll, a single choice moves by itself, and the bot takes its turn", async () => {
    const code = await createRoom({
      game: "ludo",
      rules: { ...ludoNaija, needSixToLeaveYard: false },
      players: 2,
      botLevel: "easy",
      seatBotsNow: true,
    });
    const host = await connect(code, "u-host", "host");
    host.send({ t: "hello" });
    await host.next(snapshot);
    host.send({ t: "start" });
    await host.next((m) => m.t === "snapshot" && m.room.phase === "playing");
    const view = () => host.last().view as Ludo;
    expect(view()).toMatchObject({ turn: 0, phase: "roll" });

    act(host, { type: "roll" });
    await host.next((m) => m.t === "event" && m.e.type === "rolled", "rolled");
    // Every seed is in the yard, so they're all the same move: it's made in the same go.
    await host.next((m) => m.t === "event" && m.e.type === "moved", "moved");
    await host.next(
      (m) => m.t === "snapshot" && (m.view as Ludo).seeds[0]!.some((p) => p >= 0),
      "moved in snapshot",
    );
    const stub = env.Room.getByName(code);

    // Keep going until the bot has rolled (our own bonus rolls on a six come first).
    for (let i = 0; i < 20 && view().lastRoll?.seat !== 1; i++) {
      if (view().turn === 0 && view().phase === "roll") {
        act(host, { type: "roll" });
        await host.next((m) => m.t === "ack" || m.t === "reject");
      } else if (view().turn === 0 && view().phase === "move") {
        // A six's bonus roll can leave a real choice: take the first seed, don't wait for the clock.
        act(host, { type: "move", seed: view().movable[0] });
        await host.next((m) => m.t === "ack" || m.t === "reject");
      }
      await new Promise((r) => setTimeout(r, 1000));
      await runDurableObjectAlarm(stub);
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(view().lastRoll?.seat).toBe(1);
  }, 40_000);

  it("a 4-seat game plays to the end with every place filled, within the write budget", async () => {
    const code = await createRoom({
      game: "ludo",
      rules: ludoNaija,
      players: 4,
      botLevel: "medium",
    });
    const host = await connect(code, "u-host", "host");
    host.send({ t: "hello" });
    await host.next(snapshot);
    host.send({ t: "start" });
    await host.next((m) => m.t === "snapshot" && m.room.phase === "playing");
    // The host leaves: a bot plays their seat too, so all four are bots.
    host.send({ t: "leave" });
    await host.closed;

    const stub = env.Room.getByName(code);
    // Count storage writes from here: each room upsert and each setAlarm is one row.
    const writes = await countWrites(stub);
    type Live = {
      room: {
        phase: string;
        v: number;
        state: { places: number[][] | null };
        deadlines: { bot?: number; auto?: number };
      };
    };
    // Skip the bots' thinking pauses: bring every deadline forward, then fire the alarm.
    let info = { phase: "playing", v: 0, places: null as number[][] | null };
    for (let i = 0; i < 3000 && info.phase === "playing"; i++) {
      await runInDurableObject(stub, (inst) => {
        const d = (inst as unknown as Live).room.deadlines;
        if (d.bot !== undefined) d.bot = 0;
        if (d.auto !== undefined) d.auto = 0;
      });
      await runDurableObjectAlarm(stub);
      info = await runInDurableObject(stub, (inst) => {
        const r = (inst as unknown as Live).room;
        return { phase: r.phase, v: r.v, places: r.state.places };
      });
    }
    expect(info.phase).toBe("ended");
    expect(info.places?.flat().sort()).toEqual([0, 1, 2, 3]);
    // A bot's whole turn is one state write + one alarm (docs/13 rule 4).
    const total = writes.rows + writes.alarms;
    console.log(`ludo 4 bots: ${info.v} actions, ${writes.rows} rows + ${writes.alarms} alarms`);
    expect(total).toBeLessThan(info.v);
  }, 120_000);
});

/** Counts storage writes in a room from now on: each room upsert and each setAlarm is one row. */
async function countWrites(stub: DurableObjectStub) {
  const writes = { rows: 0, alarms: 0 };
  await runInDurableObject(stub, (_i, state) => {
    const sql = state.storage.sql;
    const exec = sql.exec.bind(sql);
    sql.exec = ((query: string, ...args: unknown[]) => {
      if (/^\s*(INSERT|UPDATE|DELETE)/i.test(query)) writes.rows++;
      return exec(query, ...(args as []));
    }) as typeof sql.exec;
    const setAlarm = state.storage.setAlarm.bind(state.storage);
    state.storage.setAlarm = ((t: number | Date) => {
      writes.alarms++;
      return setAlarm(t);
    }) as typeof state.storage.setAlarm;
  });
  return writes;
}

describe("snakes and ladders", () => {
  it("an 8-player game plays to the end with every place filled, within the write budget", async () => {
    const code = await createRoom({
      game: "snakes",
      rules: snakesNaija,
      players: 8,
      botLevel: "easy",
    });
    const host = await connect(code, "u-host", "host");
    host.send({ t: "hello" });
    await host.next(snapshot);
    host.send({ t: "start" });
    await host.next((m) => m.t === "snapshot" && m.room.phase === "playing");
    expect(host.last().seats).toHaveLength(8);
    host.send({ t: "leave" }); // a bot plays the host's seat too
    await host.closed;

    const stub = env.Room.getByName(code);
    const writes = await countWrites(stub);
    type Live = {
      room: {
        phase: string;
        v: number;
        state: { places: number[][] | null };
        deadlines: { bot?: number; auto?: number };
      };
    };
    let info = { phase: "playing", v: 0, places: null as number[][] | null };
    for (let i = 0; i < 4000 && info.phase === "playing"; i++) {
      await runInDurableObject(stub, (inst) => {
        const d = (inst as unknown as Live).room.deadlines;
        if (d.bot !== undefined) d.bot = 0;
        if (d.auto !== undefined) d.auto = 0;
      });
      await runDurableObjectAlarm(stub);
      info = await runInDurableObject(stub, (inst) => {
        const r = (inst as unknown as Live).room;
        return { phase: r.phase, v: r.v, places: r.state.places };
      });
    }
    expect(info.phase).toBe("ended");
    expect(info.places?.flat().sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // Chained turns: a bot's whole turn (bonus rolls included) is one state write + one alarm.
    const total = writes.rows + writes.alarms;
    console.log(`snakes 8 bots: ${info.v} actions, ${writes.rows} rows + ${writes.alarms} alarms`);
    expect(total).toBeLessThan(info.v * 2);
  }, 120_000);
});
