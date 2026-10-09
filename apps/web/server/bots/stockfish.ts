import "server-only";
import { createRequire } from "node:module";
import path from "node:path";

// Stockfish 19 lite (single-threaded WASM, GPL-3.0) for the Medium and Hard chess bots.
// Runs only in this Node route; never imported by client code (docs/15-bot-service.md).

const DIR = path.join(process.cwd(), "server/bots/stockfish");
// .cjs: the build is CommonJS, and this package is ESM ("type": "module").
const JS = path.join(DIR, "stockfish-19-lite-single.cjs");
const WASM = path.join(DIR, "stockfish-19-lite-single.wasm");

export const STRENGTH = {
  medium: { elo: 1500, movetimeMs: 100 },
  hard: { elo: 2100, movetimeMs: 200 },
} as const;

/** `stop` is sent if no bestmove comes this long after `go`. */
const WATCHDOG_MS = 600;
/** Searches allowed to wait behind the running one. */
const MAX_WAITING = 3;
/** Per-instance backstop: CPU seconds per rolling hour (the Quota DO is the real budget). */
const HOURLY_CPU_MS = 60_000;

export class BotError extends Error {
  constructor(readonly code: "BUSY" | "QUOTA" | "ENGINE_ERROR") {
    super(code);
  }
}

type Engine = {
  sendCommand(cmd: string): void;
  listener?: (line: string) => void;
};

/** Loads the emscripten build the way the npm package's own loader does (module scope: reused while warm). */
function load(): Promise<Engine> {
  const init = createRequire(JS)(JS) as () => (m: object) => Promise<unknown>;
  const engine: Record<string, unknown> = {
    locateFile: (file: string) => (file.includes(".wasm") ? WASM : JS),
  };
  return init()(engine).then(async () => {
    const isReady = engine._isReady as (() => boolean) | undefined;
    while (isReady && !isReady()) await new Promise((r) => setTimeout(r, 10));
    const ccall = engine.ccall as (
      name: string,
      ret: null,
      types: string[],
      args: string[],
      opts: { async: boolean },
    ) => void;
    const e = engine as Engine;
    e.sendCommand = (cmd) =>
      setImmediate(() => ccall("command", null, ["string"], [cmd], { async: /^go\b/.test(cmd) }));
    return e;
  });
}

let engine: Promise<Engine> | null = null;
let chain: Promise<unknown> = Promise.resolve();
let waiting = 0;
const spent: Array<{ at: number; cpuMs: number }> = [];

function untilLine(e: Engine, match: RegExp, timeoutMs: number, onTimeout?: () => void) {
  return new Promise<string>((resolve, reject) => {
    let timer = setTimeout(() => {
      if (!onTimeout) return reject(new BotError("ENGINE_ERROR"));
      onTimeout();
      timer = setTimeout(() => reject(new BotError("ENGINE_ERROR")), 300);
    }, timeoutMs);
    e.listener = (line) => {
      if (!match.test(line)) return;
      clearTimeout(timer);
      e.listener = undefined;
      resolve(line);
    };
  });
}

async function search(
  fen: string,
  moves: readonly string[],
  level: keyof typeof STRENGTH,
  movetimeMs: number,
) {
  const e = await (engine ??= load().then(async (x) => {
    x.sendCommand("uci");
    await untilLine(x, /^uciok/, 5000);
    x.sendCommand("setoption name Threads value 1");
    x.sendCommand("setoption name Hash value 16");
    x.sendCommand("setoption name UCI_LimitStrength value true");
    return x;
  }));
  e.sendCommand(`setoption name UCI_Elo value ${STRENGTH[level].elo}`);
  e.sendCommand(`position fen ${fen}${moves.length ? ` moves ${moves.join(" ")}` : ""}`);
  e.sendCommand("isready");
  await untilLine(e, /^readyok/, 2000);
  const time = Math.min(movetimeMs, STRENGTH[level].movetimeMs);
  e.sendCommand(`go movetime ${time}`);
  const line = await untilLine(e, /^bestmove/, time + WATCHDOG_MS, () => e.sendCommand("stop"));
  const move = line.split(" ")[1];
  if (!move || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) throw new BotError("ENGINE_ERROR");
  return move;
}

/** Best move (UCI) at the level's strength; one search at a time per instance. */
export async function bestMove(
  fen: string,
  moves: readonly string[],
  level: keyof typeof STRENGTH,
  movetimeMs: number,
): Promise<{ move: string; cpuMs: number }> {
  const hourAgo = Date.now() - 3_600_000;
  while (spent.length && (spent[0]?.at ?? 0) < hourAgo) spent.shift();
  if (spent.reduce((t, x) => t + x.cpuMs, 0) > HOURLY_CPU_MS) throw new BotError("QUOTA");
  if (waiting >= MAX_WAITING) throw new BotError("BUSY");
  waiting++;
  const run = chain.then(async () => {
    const before = process.cpuUsage();
    try {
      const move = await search(fen, moves, level, movetimeMs);
      const used = process.cpuUsage(before);
      const cpuMs = Math.round((used.user + used.system) / 1000);
      spent.push({ at: Date.now(), cpuMs });
      return { move, cpuMs };
    } catch (err) {
      engine = null; // a stuck or broken engine is rebuilt on the next request
      throw err instanceof BotError ? err : new BotError("ENGINE_ERROR");
    } finally {
      waiting--;
    }
  });
  chain = run.catch(() => undefined);
  return run;
}
