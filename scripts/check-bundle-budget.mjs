#!/usr/bin/env node
// First-load JS budget check (docs/10-performance.md).
// Starts the built web app, loads each route's HTML, gzips every <script src>
// it references and fails if a route's total is over its group's budget.
// Run after `pnpm build`: `pnpm budget`.

import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const PORT = Number(process.env.BUDGET_PORT ?? 3123);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const KB = 1024;

/** Route → budget in gzip bytes. Add routes as they ship. */
const budgets = [
  {
    group: "marketing",
    limit: 145 * KB,
    routes: ["/", "/legal/terms", "/legal/privacy", "/legal/credits", "/join"],
  },
  {
    group: "app shell",
    limit: 195 * KB,
    routes: ["/login", "/signup", "/verify-email", "/forgot-password", "/reset-password"],
  },
];

/**
 * Pages behind a login can't be fetched anonymously. Measure them from the build's
 * client manifest instead: the framework scripts every page loads + the page's own chunks.
 */
const manifestBudgets = [{ group: "game shell", limit: 195 * KB, page: "(app)/r/[code]" }];

/**
 * Each game's table is a lazy chunk (≤ 60 KB gzip). Found by a string only that table shows.
 * A missing marker fails too, so renaming the copy can't silently skip the check.
 */
const gameChunkLimit = 60 * KB;
const gameMarkers = {
  "Tic-tac-toe": "Sudden death",
  "Rock Paper Scissors": "Your throw",
  Whot: "Call a shape",
  Ludo: "Pick a seed to move",
  "Snakes & Ladders": "Snakes and Ladders board",
  Chess: "Promote to",
  Draft: "tap the red ring to huff",
  "Naija Plots": "sent you an offer",
};

function gameChunks() {
  const dir = new URL("../apps/web/.next/static/chunks/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
  return Object.entries(gameMarkers).map(([game, marker]) => {
    const hits = files
      .map((f) => readFileSync(new URL(f, dir)))
      .filter((buf) => buf.includes(marker));
    return { game, sizes: hits.map((buf) => gzipSync(buf, { level: 9 }).length) };
  });
}

function pageChunks(page) {
  const file = new URL(
    `../apps/web/.next/server/app/${page}/page_client-reference-manifest.js`,
    import.meta.url,
  );
  const sandbox = { self: {} };
  new Function("self", "globalThis", readFileSync(file, "utf8"))(sandbox.self, sandbox.self);
  const manifest = Object.values(sandbox.self.__RSC_MANIFEST ?? {})[0];
  const key = Object.keys(manifest?.entryJSFiles ?? {}).find((k) =>
    k.endsWith(`/app/${page}/page`),
  );
  if (!key) throw new Error(`no manifest entry for ${page}`);
  return manifest.entryJSFiles[key].map((f) => `/_next/${f}`);
}

const server = spawn("pnpm", ["--filter", "web", "exec", "next", "start", "-p", String(PORT)], {
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});
const stopServer = () => {
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    // already gone
  }
};
process.on("exit", stopServer);

async function waitForServer(timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(ORIGIN, { method: "HEAD" });
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `web did not start on ${ORIGIN} within ${timeoutMs} ms (did you run pnpm build?)`,
  );
}

const gzCache = new Map();
async function gzipSize(src) {
  const url = new URL(src, ORIGIN).toString();
  if (!gzCache.has(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    gzCache.set(url, gzipSync(Buffer.from(await res.arrayBuffer()), { level: 9 }).length);
  }
  return gzCache.get(url);
}

async function measure(route) {
  const res = await fetch(new URL(route, ORIGIN));
  if (!res.ok) throw new Error(`${route} → ${res.status}`);
  const html = await res.text();
  // nomodule scripts are legacy polyfills that modern browsers never download.
  const srcs = [...html.matchAll(/<script\b([^>]*)>/g)]
    .filter((m) => !/\bnomodule\b/i.test(m[1]))
    .map((m) => /\bsrc="([^"]+)"/.exec(m[1])?.[1])
    .filter(Boolean);
  const unique = [...new Set(srcs)];
  let total = 0;
  for (const src of unique) total += await gzipSize(src);
  // Inline <script> bodies (RSC payload, bootstrap) also ship on first load.
  const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .join("");
  const inlineGz = inline ? gzipSync(Buffer.from(inline), { level: 9 }).length : 0;
  return { files: unique.length, external: total, inline: inlineGz };
}

const fmt = (n) => `${(n / KB).toFixed(1)} KB`;

try {
  await waitForServer();
  let failed = false;
  for (const { group, limit, routes } of budgets) {
    for (const route of routes) {
      const { files, external, inline } = await measure(route);
      const total = external + inline;
      const ok = total <= limit;
      failed ||= !ok;
      console.log(
        `${ok ? "PASS" : "FAIL"}  ${route.padEnd(24)} ${fmt(total).padStart(9)} / ${fmt(limit)}  ` +
          `(${files} scripts ${fmt(external)} + inline ${fmt(inline)}) [${group}]`,
      );
    }
  }
  // Framework scripts = what an empty static page loads.
  const shell = await fetch(new URL("/legal/terms", ORIGIN)).then((r) => r.text());
  const framework = [...shell.matchAll(/<script\b([^>]*)>/g)]
    .filter((m) => !/\bnomodule\b/i.test(m[1]))
    .map((m) => /\bsrc="([^"]+)"/.exec(m[1])?.[1])
    .filter(Boolean);
  for (const { group, limit, page } of manifestBudgets) {
    const files = [...new Set([...framework, ...pageChunks(page)])];
    let total = 0;
    for (const f of files) total += await gzipSize(f);
    const ok = total <= limit;
    failed ||= !ok;
    console.log(
      `${ok ? "PASS" : "FAIL"}  /${page.replace(/^\(.*?\)\//, "")}`.padEnd(30) +
        ` ${fmt(total).padStart(9)} / ${fmt(limit)}  (${files.length} scripts) [${group}]`,
    );
  }
  for (const { game, sizes } of gameChunks()) {
    const size = Math.max(0, ...sizes);
    const ok = sizes.length > 0 && size <= gameChunkLimit;
    failed ||= !ok;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${game} table`.padEnd(30) +
        ` ${(sizes.length ? fmt(size) : "not found").padStart(9)} / ${fmt(gameChunkLimit)}  [game chunk]`,
    );
  }
  // GPL boundary (AGENTS.md §1.11): Stockfish runs only in the bot route, never in the browser.
  const staticDir = new URL("../apps/web/.next/static/", import.meta.url);
  const leaks = readdirSync(staticDir, { recursive: true })
    .map(String)
    .filter((f) => /\.(js|css|wasm|map)$/.test(f))
    .filter(
      (f) =>
        /stockfish/i.test(f) || /stockfish/i.test(readFileSync(new URL(f, staticDir), "latin1")),
    );
  failed ||= leaks.length > 0;
  console.log(
    `${leaks.length ? "FAIL" : "PASS"}  no GPL engine in browser files`.padEnd(30) +
      (leaks.length ? `  ${leaks.slice(0, 3).join(", ")}` : ""),
  );
  stopServer();
  process.exit(failed ? 1 : 0);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  stopServer();
  process.exit(1);
}
