import {
  chessNaija,
  draughtsNaija,
  ludoNaija,
  plotsNaija,
  snakesNaija,
  whotNaija,
  type ChessState,
  type DraughtsState,
  type PlotsState,
  type TttState,
} from "@gamehub/engine";
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
    // Tests that check turns expect the host to move first; "Who goes first" has its own tests.
    firstPlayer: "seat1",
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

/** Waits until a client's latest snapshot passes `ok` (for state already sent or still coming). */
async function until(c: Client, ok: (s: ReturnType<Client["last"]>) => boolean, label: string) {
  const deadline = Date.now() + 3000;
  while (!ok(c.last())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

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

describe("lobby settings", () => {
  const config = (over: Record<string, unknown> = {}) => ({
    t: "config",
    game: "whot",
    rules: whotNaija,
    players: 4,
    botLevel: null,
    firstPlayer: "random",
    ...over,
  });

  it("the host changes game, seats and rules; shrinking drops empty seats, then bots", async () => {
    const code = await createRoom();
    const host = await connect(code, "u-host", "host");
    host.send({ t: "hello" });
    await host.next(snapshot);
    const guest = await connect(code, "u-guest", "guest");
    guest.send({ t: "hello" });
    await guest.next((m) => m.t === "snapshot" && m.you === 1);

    guest.send(config());
    await guest.next((m) => m.t === "error" && m.code === "NOT_HOST", "guest can't edit");

    host.send(config({ firstPlayer: "rotate" }));
    const s1 = await host.next((m) => m.t === "snapshot" && m.room.game === "whot");
    if (s1.t !== "snapshot") throw new Error("snapshot");
    expect(s1.room).toMatchObject({ size: 4, firstPlayer: "rotate", minPlayers: 2 });
    expect(s1.seats.map((x) => x.status)).toEqual(["connected", "connected", "empty", "empty"]);

    // Bots now in the empty seats, then down to 3: an empty-free table loses a bot, not a person.
    host.send(config({ players: 4, botLevel: "easy", seatBotsNow: true }));
    await host.next(
      (m) => m.t === "snapshot" && m.seats.filter((x) => x.status === "bot").length === 2,
    );
    host.send(config({ players: 3, botLevel: "easy" }));
    const s2 = await host.next((m) => m.t === "snapshot" && m.room.size === 3);
    if (s2.t !== "snapshot") throw new Error("snapshot");
    expect(s2.seats.map((x) => x.status)).toEqual(["connected", "connected", "bot"]);
    expect(s2.seats[2]?.name).toBe("Bot (Easy)");

    // Back to tic-tac-toe for two: the bot goes, both people stay.
    host.send(
      config({
        game: "tictactoe",
        rules: { turnSeconds: 15, bestOf: 3, alternateStarter: true },
        players: 2,
      }),
    );
    const s3 = await host.next((m) => m.t === "snapshot" && m.room.game === "tictactoe");
    if (s3.t !== "snapshot") throw new Error("snapshot");
    expect(s3.seats.map((x) => x.userId)).toEqual(["u-host", "u-guest"]);

    // A third person arrives (spectating: the table is full)... and the host can't drop below the people seated.
    host.send(config({ players: 3 }));
    await host.next((m) => m.t === "snapshot" && m.room.size === 3);
    const third = await connect(code, "u-third", "third");
    third.send({ t: "hello" });
    await third.next((m) => m.t === "snapshot" && m.you === 2);
    host.send(config({ players: 2 }));
    await host.next((m) => m.t === "error" && m.code === "TOO_MANY_PLAYERS");
    host.send(config({ game: "ludo", rules: { nope: true } }));
    await host.next((m) => m.t === "error" && m.code === "BAD_MESSAGE", "bad rules refused");
    host.send(
      config({
        game: "tictactoe",
        rules: { turnSeconds: 15, bestOf: 3, alternateStarter: true },
        players: 3,
      }),
    );
    await host.next((m) => m.t === "error" && m.code === "BAD_MESSAGE", "tic-tac-toe is 2 players");
  });

  it("the host shuffles seats; everyone is told their new seat", async () => {
    const code = await createRoom({ game: "whot", rules: whotNaija, players: 5 });
    const users = ["u-host", "u-a", "u-b", "u-c"];
    const clients: Client[] = [];
    for (const u of users) {
      const c = await connect(code, u, u);
      c.send({ t: "hello" });
      await c.next(snapshot);
      clients.push(c);
    }
    const host = clients[0]!;
    clients[1]!.send({ t: "shuffle" });
    await clients[1]!.next((m) => m.t === "error" && m.code === "NOT_HOST");

    // Shuffle until the order changes (1 in 24 it comes out the same).
    let order = users.join();
    for (let i = 0; i < 10 && order === users.join(); i++) {
      const before = host.last().v;
      host.send({ t: "shuffle" });
      const snap = await host.next((m) => m.t === "snapshot" && m.v > before);
      if (snap.t !== "snapshot") throw new Error("snapshot");
      expect(snap.seats.at(-1)?.status).toBe("empty"); // empty seats stay at the end
      order = snap.seats
        .slice(0, 4)
        .map((x) => x.userId)
        .join();
    }
    expect(order).not.toBe(users.join());
    expect(order.split(",").sort()).toEqual([...users].sort());
    for (const [i, c] of clients.entries())
      await until(
        c,
        (m) => m.seats.findIndex((x) => x.userId === users[i]) === m.you,
        `${users[i]} reseated`,
      );
  });

  it("who goes first: takes turns moves one seat along; last winner starts the next game", async () => {
    const code = await createRoom({
      rules: { turnSeconds: 15, bestOf: 1, alternateStarter: true },
      firstPlayer: "rotate",
    });
    const host = await connect(code, "u-host", "host");
    host.send({ t: "hello" });
    await host.next(snapshot);
    const guest = await connect(code, "u-guest", "guest");
    guest.send({ t: "hello" });
    await guest.next((m) => m.t === "snapshot" && m.you === 1);
    const byTurn = (seat: number) => (seat === 0 ? host : guest);

    /** Starts a game, lets whoever moves first win it (cells 0-1-2), and returns the first seat. */
    async function playOne() {
      host.send({ t: "start" });
      await host.next((m) => m.t === "snapshot" && m.room.phase === "playing");
      const first = view(host).turn;
      for (const cell of [0, 3, 1, 4, 2]) {
        const who = byTurn(view(host).turn);
        const before = host.last().v;
        act(who, { type: "place", cell });
        await host.next((m) => m.t === "snapshot" && m.v > before, `move ${cell}`);
      }
      await until(host, (m) => m.room.phase === "ended", "game over");
      host.send({ t: "rematch" });
      await host.next((m) => m.t === "snapshot" && m.room.phase === "lobby");
      return first;
    }

    const g1 = await playOne();
    const g2 = await playOne();
    expect(g2).toBe((g1 + 1) % 2);

    // Last winner: game 2's first mover won it, so they start game 3.
    host.send(
      config({
        game: "tictactoe",
        rules: { turnSeconds: 15, bestOf: 1, alternateStarter: true },
        players: 2,
        firstPlayer: "lastWinner",
      }),
    );
    await host.next((m) => m.t === "snapshot" && m.room.firstPlayer === "lastWinner");
    expect(await playOne()).toBe(g2);
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

describe("chess", () => {
  const cv = (c: Client) => c.last().view as ChessState;
  type Live = {
    room: {
      phase: string;
      state: ChessState | null;
      deadlines: { turns?: Record<number, number>; bot?: number };
    };
  };

  async function twoPlayers(rules = chessNaija) {
    const code = await createRoom({ game: "chess", rules });
    const host = await connect(code, "u-host", "host");
    host.send({ t: "hello" });
    await host.next(snapshot);
    const guest = await connect(code, "u-guest", "guest");
    guest.send({ t: "hello" });
    await guest.next((m) => m.t === "snapshot" && m.you === 1);
    host.send({ t: "start" });
    await host.next((m) => m.t === "snapshot" && m.room.phase === "playing");
    return { code, host, guest, stub: env.Room.getByName(code) };
  }

  it("the clock's flag time is the deadline, and running out ends the game on time", async () => {
    const { host, guest, stub } = await twoPlayers();
    expect(cv(host).white).toBe(0); // seat 1 starts = plays White (tests create rooms with "seat1")
    // The abort window before the first move.
    expect(host.last().deadlines.turns?.[0]).toBe(cv(host).startedAt + 30_000);
    for (const [who, uci] of [
      [host, "e2e4"],
      [guest, "e7e5"],
    ] as const) {
      const before = host.last().v;
      act(who, { type: "move", uci, mt: 400 });
      await host.next((m) => m.t === "snapshot" && m.v > before, uci);
    }
    const s = cv(host);
    const flagAt = (s.turnStartedAt as number) + 300_000 + 2000; // 5+3: quota 3 s, grace capped at 2 s
    expect(host.last().deadlines.turns?.[0]).toBe(flagAt);
    // White's clock runs out: wind its turn start back 5 minutes, then let the alarm fire.
    await runInDurableObject(stub, (inst) => {
      const r = (inst as unknown as Live).room;
      const st = r.state as ChessState;
      st.turnStartedAt = (st.turnStartedAt as number) - 400_000;
      r.deadlines.turns = { 0: 0 };
    });
    await runDurableObjectAlarm(stub);
    const ended = await guest.next((m) => m.t === "ended", "flag");
    expect(ended).toMatchObject({ ranking: [[1], [0]] });
    await until(guest, (m) => (m.view as ChessState).result !== null, "result in snapshot");
    expect(cv(guest).result).toEqual({ winner: "b", reason: "timeout" });
  });

  it("a player who drops mid-game: a bot plays their side on their own clock, and they come back", async () => {
    const { code, host, guest, stub } = await twoPlayers();
    for (const [who, uci] of [
      [host, "e2e4"],
      [guest, "e7e5"],
      [host, "g1f3"],
    ] as const) {
      const before = host.last().v;
      act(who, { type: "move", uci, mt: 300 });
      await host.next((m) => m.t === "snapshot" && m.v > before, uci);
    }
    // Black's clock is running when the guest's connection dies.
    guest.ws.close(3000, "network");
    await host.next((m) => m.t === "snapshot" && m.seats[1]?.status === "away", "guest away");
    await new Promise((r) => setTimeout(r, 300)); // GRACE_MS is 150 in tests
    await runDurableObjectAlarm(stub);
    await host.next((m) => m.t === "snapshot" && m.seats[1]?.status === "bot", "bot took over");
    // The covering bot (Medium; the test has no bot service, so its fallback) moves for Black.
    await fireBot(stub);
    await until(host, (m) => (m.view as ChessState).moves.length === 4, "bot moved for Black");
    expect(cv(host).result).toBeNull();
    // Black's own clock paid for that move (it started when White moved).
    expect(cv(host).clock?.b.remainingMs).toBeLessThan(300_000 + 3000);
    const back = await connect(code, "u-guest", "guest");
    back.send({ t: "hello" });
    const snap = await back.next((m) => m.t === "snapshot" && m.you === 1, "guest back");
    expect(snap.t === "snapshot" && snap.seats[1]?.status).toBe("connected");
  }, 20_000);

  it("nobody moves in the abort window: no result, back to the lobby", async () => {
    const { host, stub } = await twoPlayers();
    await runInDurableObject(stub, (inst) => {
      const r = (inst as unknown as Live).room;
      (r.state as ChessState).startedAt -= 60_000;
      r.deadlines.turns = { 0: 0 };
    });
    await runDurableObjectAlarm(stub);
    await host.next((m) => m.t === "event" && m.e.type === "game_over" && m.e.reason === "aborted");
    await host.next((m) => m.t === "snapshot" && m.room.phase === "lobby", "back in the lobby");
  });

  it("against a bot: the bot moves on its alarm and takes back when asked", async () => {
    const code = await createRoom({
      game: "chess",
      rules: chessNaija,
      players: 2,
      botLevel: "easy",
      seatBotsNow: true,
    });
    const host = await connect(code, "u-host", "host");
    host.send({ t: "hello" });
    await host.next(snapshot);
    host.send({ t: "start" });
    await host.next((m) => m.t === "snapshot" && m.room.phase === "playing");
    const stub = env.Room.getByName(code);
    act(host, { type: "move", uci: "d2d4" });
    await host.next((m) => m.t === "snapshot" && cv(host).moves.length === 1);
    await fireBot(stub);
    await host.next(
      (m) => m.t === "snapshot" && (m.view as ChessState).moves.length === 2,
      "bot replied",
    );
    act(host, { type: "request_takeback" });
    await host.next((m) => m.t === "event" && m.e.type === "takeback_done", "bot accepted");
    await host.next((m) => m.t === "snapshot" && (m.view as ChessState).moves.length === 0);
  });
});

type Call = { url: string; body: Record<string, unknown> };
/** Swaps the isolate's fetch for a stand-in bot service; returns the calls it saw. */
function serve(reply: (body: Record<string, unknown>) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("http://bots.test")) return real(input, init);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url, body });
    return reply(body);
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = real) };
}

/** Clears the global bot-CPU counter (it lives on between tests in one run). */
const resetQuota = () =>
  runInDurableObject(env.Quota.getByName("global"), (inst, state) => {
    (inst as unknown as { c: unknown }).c = null;
    state.storage.sql.exec("DROP TABLE IF EXISTS quota");
  });

describe("chess bot service", () => {
  // No clock: on a clock, bots think 1–4 % of their time (seconds); here it's under 1.2 s.
  async function botGame(level: "medium" | "hard") {
    const code = await createRoom({
      game: "chess",
      rules: { ...chessNaija, timeControl: null },
      players: 2,
      botLevel: level,
      seatBotsNow: true,
    });
    const host = await connect(code, "u-host", "host");
    host.send({ t: "hello" });
    await host.next(snapshot);
    host.send({ t: "start" });
    await host.next((m) => m.t === "snapshot" && m.room.phase === "playing");
    act(host, { type: "move", uci: "e2e4" });
    await host.next((m) => m.t === "snapshot" && (m.view as ChessState).moves.length === 1);
    return { host, stub: env.Room.getByName(code) };
  }
  const movesOf = (c: Client) => (c.last().view as ChessState).moves;

  it("plays the service's move and counts its CPU against the day's budget", async () => {
    const svc = serve(() =>
      Response.json({ ok: true, move: "c7c5", cpuMs: 210, engine: "stockfish-19-lite" }),
    );
    try {
      const { host, stub } = await botGame("hard");
      await fireBot(stub);
      await until(host, () => movesOf(host).length === 2, "bot moved");
      expect(movesOf(host)[1]).toBe("c7c5");
      expect(svc.calls[0]?.body).toMatchObject({
        game: "chess",
        level: "hard",
        movetimeMs: 200,
        history: [],
      });
      const usage = await env.Quota.getByName("global").usage();
      expect(usage.dayMs).toBeGreaterThanOrEqual(210);
    } finally {
      svc.restore();
    }
  });

  it("an illegal or failed answer falls back to the built-in engine; three failures rest the service", async () => {
    let n = 0;
    const svc = serve(() =>
      n++ === 0
        ? Response.json({ ok: true, move: "e1e8", cpuMs: 1, engine: "stockfish-19-lite" })
        : new Response("down", { status: 500 }),
    );
    try {
      const { host, stub } = await botGame("medium");
      for (let ply = 2; ply <= 8; ply += 2) {
        await fireBot(stub);
        await until(host, () => movesOf(host).length === ply, `bot move ${ply}`);
        const reply = ["g1f3", "f1c4", "d2d3", "c1d2"][ply / 2 - 1] as string;
        act(host, { type: "move", uci: reply });
        await until(host, () => movesOf(host).length === ply + 1, `my move ${ply + 1}`);
      }
      // Four bot moves, all from the fallback; the service was asked three times, then rested.
      expect(svc.calls.length).toBe(3);
    } finally {
      svc.restore();
    }
  }, 30_000);

  it("no call at all once the day's budget is spent", async () => {
    const svc = serve(() =>
      Response.json({ ok: true, move: "c7c5", cpuMs: 1, engine: "stockfish-19-lite" }),
    );
    try {
      const quota = env.Quota.getByName("global");
      for (let i = 0; i < 10; i++) await quota.addBot(30_000);
      expect(await quota.allowBot()).toBe(false);
      const { host, stub } = await botGame("hard");
      await fireBot(stub);
      await until(host, () => movesOf(host).length === 2, "bot moved");
      expect(svc.calls.length).toBe(0);
    } finally {
      svc.restore();
      await resetQuota();
    }
  });
});

describe("draughts", () => {
  const dv = (c: Client) => c.last().view as DraughtsState;
  const rules = { ...draughtsNaija, firstMove: "light" as const };

  async function botGame(level: "medium" | "hard") {
    const code = await createRoom({
      game: "draughts",
      rules,
      players: 2,
      botLevel: level,
      seatBotsNow: true,
    });
    const host = await connect(code, "u-host", "host");
    host.send({ t: "hello" });
    await host.next(snapshot);
    host.send({ t: "start" });
    await host.next((m) => m.t === "snapshot" && m.room.phase === "playing");
    expect(dv(host)).toMatchObject({ variant: "naija10", light: 0, turn: "light" });
    act(host, { type: "move", from: 32, path: [28], mt: 500 });
    await until(host, () => dv(host).moves.length === 1, "my move");
    return { host, stub: env.Room.getByName(code) };
  }

  it("two players: moves, a compulsory capture, and the abort window as the first deadline", async () => {
    const code = await createRoom({ game: "draughts", rules });
    const host = await connect(code, "u-host", "host");
    host.send({ t: "hello" });
    await host.next(snapshot);
    const guest = await connect(code, "u-guest", "guest");
    guest.send({ t: "hello" });
    await guest.next((m) => m.t === "snapshot" && m.you === 1);
    host.send({ t: "start" });
    await host.next((m) => m.t === "snapshot" && m.room.phase === "playing");
    expect(host.last().deadlines.turns?.[0]).toBe(dv(host).startedAt + 30_000);
    for (const [who, from, path] of [
      [host, 32, [28]],
      [guest, 19, [23]],
      [host, 28, [19]],
    ] as const) {
      const before = host.last().v;
      act(who, { type: "move", from, path, mt: 300 });
      await host.next((m) => m.t === "snapshot" && m.v > before, `${from}`);
    }
    expect(dv(host).moves.at(-1)).toEqual({ from: 28, path: [19], captured: [23] });
    expect(dv(guest).board.filter((v) => v < 0)).toHaveLength(19);
  });

  it("a Hard bot asks the bot service (the draughts route) and plays its move", async () => {
    const svc = serve(() =>
      Response.json({ ok: true, move: "19-23", cpuMs: 150, engine: "gamehub-draughts" }),
    );
    try {
      const { host, stub } = await botGame("hard");
      await fireBot(stub);
      await until(host, () => dv(host).moves.length === 2, "bot moved");
      expect(dv(host).moves[1]).toEqual({ from: 19, path: [23], captured: [] });
      expect(svc.calls[0]?.body).toMatchObject({
        game: "draughts",
        level: "hard",
        variant: "naija10",
        turn: "dark",
        captureRule: "free",
        movetimeMs: 150,
      });
      expect(String(svc.calls[0]?.body.board)).toHaveLength(50);
    } finally {
      svc.restore();
    }
  });

  it("Medium plays in the room itself, without the service", async () => {
    const svc = serve(() => new Response("unused", { status: 500 }));
    try {
      const { host, stub } = await botGame("medium");
      await fireBot(stub);
      await until(host, () => dv(host).moves.length === 2, "bot moved");
      expect(svc.calls).toHaveLength(0);
    } finally {
      svc.restore();
    }
  });
});

describe("naija plots", () => {
  it("people pick tokens in the lobby, one each", async () => {
    const code = await createRoom({ game: "plots", rules: plotsNaija });
    const host = await connect(code, "u-host", "host");
    host.send({ t: "hello" });
    await host.next(snapshot);
    const guest = await connect(code, "u-guest", "guest");
    guest.send({ t: "hello" });
    await guest.next((m) => m.t === "snapshot" && m.you === 1);
    host.send({ t: "token", token: 7 });
    await host.next((m) => m.t === "snapshot" && m.seats[0]?.token === 7, "host picked");
    guest.send({ t: "token", token: 7 });
    await guest.next((m) => m.t === "error" && m.code === "BAD_MESSAGE", "taken");
    guest.send({ t: "token", token: 3 });
    await host.next((m) => m.t === "snapshot" && m.seats[1]?.token === 3, "guest picked");
    // Changing your mind frees the old one.
    host.send({ t: "token", token: 2 });
    await host.next((m) => m.t === "snapshot" && m.seats[0]?.token === 2, "host changed");
    guest.send({ t: "token", token: 7 });
    await host.next((m) => m.t === "snapshot" && m.seats[1]?.token === 7, "guest took 7");
  });

  const pv = (c: Client) => c.last().view as PlotsState;
  type Live = { room: { state: PlotsState; deadlines: { turns?: Record<number, number> } } };

  async function vsBot(rules = plotsNaija) {
    const code = await createRoom({
      game: "plots",
      rules,
      players: 2,
      botLevel: "medium",
      seatBotsNow: true,
    });
    const host = await connect(code, "u-host", "host");
    host.send({ t: "hello" });
    await host.next(snapshot);
    host.send({ t: "start" });
    await host.next((m) => m.t === "snapshot" && m.room.phase === "playing");
    return { host, stub: env.Room.getByName(code) };
  }

  it("your action clock, and a bot's whole turn in one go", async () => {
    // No auctions here (they have their own test), so the turn order is all that moves.
    const { host, stub } = await vsBot({ ...plotsNaija, auctions: false });
    const s0 = pv(host);
    expect(s0.order).toEqual([0, 1]);
    expect("decks" in s0).toBe(false);
    expect(host.last().deadlines.turns?.[0]).toBe(s0.since + 30_000 + 3000);
    // Play our turn to the end: roll (again on doubles), don't buy, end it.
    for (let i = 0; i < 12 && pv(host).order[pv(host).turn] === 0 && !pv(host).places; i++) {
      const s = pv(host);
      const before = host.last().v;
      if (s.debts.length) act(host, { type: "declare_bankruptcy" });
      else if (s.step === "buy") act(host, { type: "decline" });
      else if (s.step === "roll") act(host, { type: "roll" });
      else act(host, { type: "end_turn" });
      await host.next((m) => m.t === "snapshot" && m.v > before, `step ${i}`);
    }
    if (pv(host).places) return;
    expect(pv(host).order[pv(host).turn]).toBe(1);
    const turnsBefore = pv(host).turns;
    // One alarm: the bot rolls, decides, builds and ends its turn in one go.
    await fireBot(stub);
    await until(host, () => pv(host).turns > turnsBefore || !!pv(host).places, "bot turn done");
    expect(pv(host).order[pv(host).turn]).toBe(0);
  }, 20_000);

  it("an auction: the bot bids on its alarm, the clock is the auction's, and it closes on time", async () => {
    const { host, stub } = await vsBot();
    // Put the host on Banana Island with the choice to buy.
    await runInDurableObject(stub, (inst) => {
      const st = (inst as unknown as Live).room.state;
      st.pos[0] = 39;
      st.step = "buy";
      st.since = Date.now();
    });
    act(host, { type: "decline" });
    await until(host, () => !!pv(host).auction, "auction started");
    const endsAt = pv(host).auction?.endsAt as number;
    expect(host.last().deadlines.turns?.[0]).toBe(endsAt);
    await fireBot(stub);
    await until(host, () => pv(host).auction?.by === 1 || !pv(host).auction, "bot bid");
    expect(pv(host).auction?.by).toBe(1);
    // Nobody else bids: let the clock run out.
    await runInDurableObject(stub, (inst) => {
      const r = (inst as unknown as Live).room;
      if (r.state.auction) r.state.auction.endsAt = Date.now() - 1;
      r.deadlines.turns = { 0: 0 };
    });
    await runDurableObjectAlarm(stub);
    await until(host, () => !pv(host).auction, "auction closed");
    expect(pv(host).owner[39]).toBe(1);
    expect(pv(host).step).toBe("manage");
    // Sitting out an auction isn't a missed turn.
    const timeouts = await runInDurableObject(
      stub,
      (inst) =>
        (inst as unknown as { room: { seats: Array<{ timeouts: number }> } }).room.seats[0]
          ?.timeouts,
    );
    expect(timeouts).toBe(0);
  }, 20_000);
});
