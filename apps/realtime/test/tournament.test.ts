import { rpsNaija } from "@gamehub/engine";
import type { ServerRoomMsg, ServerTournamentMsg, TournamentConfig } from "@gamehub/protocol";
import { signBody } from "@gamehub/protocol/hmac";
import { env, runInDurableObject } from "cloudflare:test";
import { exports } from "cloudflare:workers";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

const ORIGIN = "http://game.test";
const BASE = "https://realtime.test";

const ticket = (sub: string, name: string, scope: string) =>
  new SignJWT({ name, avatar: null, scope })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setAudience("gamehub-realtime")
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(env.REALTIME_TICKET_SECRET));

type Msg = ServerTournamentMsg | ServerRoomMsg;
type Client = {
  msgs: Msg[];
  send: (m: unknown) => void;
  next: <T extends Msg>(pred: (m: Msg) => m is T, label: string, ms?: number) => Promise<T>;
  close: () => void;
};

async function connect(party: "tournament" | "room", code: string, sub: string): Promise<Client> {
  const t = await ticket(sub, sub, `${party}:${code}`);
  const res = await exports.default.fetch(`${BASE}/parties/${party}/${code}?ticket=${t}`, {
    headers: { Upgrade: "websocket", Origin: ORIGIN },
  });
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

type Snap = Extract<ServerTournamentMsg, { t: "t_snapshot" }>;
const isSnap = (m: Msg): m is Snap => m.t === "t_snapshot";
const snapWhere =
  (ok: (s: Snap) => boolean) =>
  (m: Msg): m is Snap =>
    isSnap(m) && ok(m);

const config = (o: Partial<TournamentConfig> = {}): TournamentConfig => ({
  name: "Friday Madness",
  entrants: 4,
  botFill: "easy",
  stages: [{ game: "rps", rules: rpsNaija, tableSize: 2, advance: 1, bestOf: 1 }],
  autoStart: false,
  spectators: true,
  ...o,
});

async function createTournament(c: TournamentConfig, host = "u-host") {
  const body = JSON.stringify({ config: c, host: { userId: host, name: host, avatar: null } });
  const { ts, sig } = await signBody(env.INTERNAL_HMAC_SECRET, body);
  return exports.default.fetch(`${BASE}/tournaments`, {
    method: "POST",
    body,
    headers: { "x-gh-ts": ts, "x-gh-sig": sig, "content-type": "application/json" },
  });
}

/** Catches the results post to web. */
function catchResults() {
  const posts: Array<{ body: Record<string, unknown>; sig: string | null }> = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith("http://web.test")) return real(input, init);
    posts.push({
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      sig: new Headers(init?.headers).get("x-gh-sig"),
    });
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  return { posts, restore: () => (globalThis.fetch = real) };
}

describe("tournament creation", () => {
  it("makes a 7-letter code; refuses unsigned requests and plans that can't work", async () => {
    const res = await createTournament(config());
    expect(res.status).toBe(201);
    expect(((await res.json()) as { code: string }).code).toMatch(/^[A-Z2-9]{7}$/);
    const bad = await createTournament(
      config({ stages: [{ game: "ludo", rules: null, tableSize: 6, advance: 2, bestOf: 1 }] }),
    );
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { errors: string[] }).errors.join(" ")).toMatch(/Ludo tables/);
    const unsigned = await exports.default.fetch(`${BASE}/tournaments`, {
      method: "POST",
      body: "{}",
    });
    expect(unsigned.status).toBe(401);
  });

  it("a room ticket doesn't open a tournament socket", async () => {
    const res = await createTournament(config());
    const { code } = (await res.json()) as { code: string };
    const t = await ticket("u-host", "host", `room:${code}`);
    const ws = await exports.default.fetch(`${BASE}/parties/tournament/${code}?ticket=${t}`, {
      headers: { Upgrade: "websocket", Origin: ORIGIN },
    });
    expect(ws.status).toBe(401);
  });
});

describe("tournament lobby", () => {
  it("people join; only the host edits and starts; a full lobby with auto start starts itself", async () => {
    const { code } = (await (await createTournament(config({ botFill: null }))).json()) as {
      code: string;
    };
    const host = await connect("tournament", code, "u-host");
    host.send({ t: "t_hello" });
    const first = await host.next(isSnap, "snapshot");
    expect(first.state.phase).toBe("lobby");
    expect(first.you).toBe("e0");
    expect(first.state.entrants).toHaveLength(1);

    const ada = await connect("tournament", code, "u-ada");
    ada.send({ t: "t_hello" });
    expect((await ada.next(isSnap, "ada snapshot")).you).toBe("spectator");
    ada.send({ t: "t_join" });
    await ada.next(
      snapWhere((s) => s.you === "e1"),
      "ada joined",
    );
    ada.send({ t: "t_config", config: config({ autoStart: true }) });
    await ada.next(
      (m): m is Extract<Msg, { t: "error" }> => m.t === "error" && m.code === "NOT_HOST",
      "not host",
    );
    ada.send({ t: "t_start" });
    await ada.next(
      (m): m is Extract<Msg, { t: "error" }> => m.t === "error" && m.code === "NOT_HOST",
      "not host start",
    );
    // A plan that can't work is refused with the reasons.
    host.send({
      t: "t_config",
      config: config({
        stages: [{ game: "chess", rules: null, tableSize: 3, advance: 1, bestOf: 1 }],
      }),
    });
    const why = await host.next(
      (m): m is Extract<Msg, { t: "error" }> => m.t === "error" && m.code === "BAD_STAGES",
      "bad stages",
    );
    expect(why.t === "error" && "detail" in why && why.detail?.join(" ")).toMatch(
      /Chess is for 2 players/,
    );
    // Without bots, two people can't start a 4-player plan.
    host.send({ t: "t_start" });
    await host.next(
      (m): m is Extract<Msg, { t: "error" }> => m.t === "error" && m.code === "BAD_STAGES",
      "too few",
    );
    host.send({ t: "t_config", config: config({ botFill: null, autoStart: true }) });
    await host.next(
      snapWhere((s) => s.state.config.autoStart),
      "config saved",
    );
    for (const u of ["u-bola", "u-chidi"]) {
      const c = await connect("tournament", code, u);
      c.send({ t: "t_join" });
    }
    await host.next(
      snapWhere((s) => s.state.phase === "running"),
      "auto start",
      8000,
    );
    // Everyone at a table is sent to it.
    const go = await host.next(
      (m): m is Extract<Msg, { t: "t_go" }> => m.t === "t_go",
      "your table is ready",
    );
    expect(go.t === "t_go" && go.code).toMatch(/^[A-Z2-9]{6}$/);
    const room = await connect("room", go.t === "t_go" ? go.code : "", "u-host");
    room.send({ t: "hello" });
    const rs = await room.next(
      (m): m is Extract<Msg, { t: "snapshot" }> => m.t === "snapshot",
      "room snapshot",
    );
    expect(rs.t === "snapshot" && rs.room.kind).toBe("tournament");
    expect(rs.t === "snapshot" && rs.room.tournament?.label).toMatch(
      /^Stage 1 · Rock Paper Scissors · Semi-final/,
    );
    expect(rs.t === "snapshot" && rs.you).not.toBe("spectator");
    // Lobby edits are refused at a tournament table.
    room.send({ t: "start" });
    await room.next(
      (m): m is Extract<Msg, { t: "error" }> => m.t === "error" && m.code === "WRONG_PHASE",
      "no lobby edits",
    );
  });
});

describe("a whole tournament", () => {
  it("bots play it out after the host leaves; players go through; results reach web once", async () => {
    const web = catchResults();
    try {
      const { code } = (await (await createTournament(config({ entrants: 4 }))).json()) as {
        code: string;
      };
      const host = await connect("tournament", code, "u-host");
      host.send({ t: "t_hello" });
      await host.next(isSnap, "snapshot");
      host.send({ t: "t_start" });
      await host.next(
        snapWhere((s) => s.state.phase === "running"),
        "running",
      );
      // The host leaves: a bot plays their seat for the rest of the tournament.
      host.send({ t: "t_leave" });
      await host.next(
        snapWhere((s) => s.state.entrants.find((e) => e.id === "e0")?.status === "left"),
        "left",
      );
      const done = await host.next(
        snapWhere((s) => s.state.phase === "finished"),
        "finished",
        45_000,
      );
      const st = done.state;
      expect(st.placements).toHaveLength(4);
      expect(st.placements?.filter((p) => p.place === 1)).toHaveLength(1);
      // Semi-finals then a final: three tables, all done.
      expect(st.tables.filter((t) => !t.bye)).toHaveLength(3);
      expect(st.tables.every((t) => t.status === "done" && t.code)).toBe(true);
      const champion = host.msgs.find((m) => m.t === "t_event" && m.e === "champion");
      expect(champion).toBeTruthy();

      // The results reach web once, signed, with every place and every table's games.
      const deadline = Date.now() + 10_000;
      while (!web.posts.length && Date.now() < deadline)
        await new Promise((r) => setTimeout(r, 50));
      expect(web.posts).toHaveLength(1);
      const post = web.posts[0];
      expect(post?.sig).toBeTruthy();
      const entries = post?.body.entries as Array<{
        place: number;
        playedByBot: boolean;
        isBot: boolean;
      }>;
      expect(entries).toHaveLength(4);
      expect(entries.filter((e) => !e.isBot).every((e) => e.playedByBot)).toBe(true);
      expect((post?.body.matches as unknown[]).length).toBeGreaterThanOrEqual(3);

      // A report arriving again is acknowledged and changes nothing.
      const stub = env.Tournament.getByName(code);
      const before = await runInDurableObject(
        stub,
        (_i, state) =>
          state.storage.sql.exec<{ json: string }>("SELECT json FROM tournament").one().json,
      );
      const final = st.tables.find((t) => t.round === 1);
      const again = await stub.fetch("https://tournament/report", {
        method: "POST",
        headers: { "x-gh-internal": "report" },
        body: JSON.stringify({
          table: final?.id,
          ranking: final?.ranking,
          playedByBot: [],
          matches: [],
        }),
      });
      expect(again.status).toBe(200);
      const after = await runInDurableObject(
        stub,
        (_i, state) =>
          state.storage.sql.exec<{ json: string }>("SELECT json FROM tournament").one().json,
      );
      expect(JSON.parse(after).v).toBe(JSON.parse(before).v);
      expect(web.posts).toHaveLength(1);
    } finally {
      web.restore();
    }
  }, 60_000);

  it("a multiplayer stage then a knockout: tables of 4, top 2 through, then the final", async () => {
    const web = catchResults();
    try {
      const { code } = (await (
        await createTournament(
          config({
            entrants: 8,
            stages: [
              { game: "rps", rules: rpsNaija, tableSize: 4, advance: 2, bestOf: 1 },
              { game: "rps", rules: rpsNaija, tableSize: 2, advance: 1, bestOf: 1 },
            ],
          }),
        )
      ).json()) as { code: string };
      const host = await connect("tournament", code, "u-host");
      host.send({ t: "t_hello" });
      await host.next(isSnap, "snapshot");
      host.send({ t: "t_start" });
      await host.next(
        snapWhere((s) => s.state.phase === "running"),
        "running",
      );
      host.send({ t: "t_leave" });
      const done = await host.next(
        snapWhere((s) => s.state.phase === "finished"),
        "finished",
        50_000,
      );
      const st = done.state;
      const first = st.tables.filter((t) => t.stage === 0);
      expect(first.map((t) => t.seats.length)).toEqual([4, 4]);
      expect(first.every((t) => t.through?.length === 2)).toBe(true);
      // 4 left: semi-finals and a final, no byes.
      expect(st.tables.filter((t) => t.stage === 1)).toHaveLength(3);
      expect(st.placements?.map((p) => p.place).sort((a, b) => a - b)).toEqual(
        expect.arrayContaining([1, 2]),
      );
      // Wait for the results post, so it never goes out after the fake web is gone.
      const deadline = Date.now() + 10_000;
      while (!web.posts.length && Date.now() < deadline)
        await new Promise((r) => setTimeout(r, 50));
      expect(web.posts).toHaveLength(1);
    } finally {
      web.restore();
    }
  }, 60_000);
});
