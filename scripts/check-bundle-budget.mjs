#!/usr/bin/env node
// First-load JS budget check (docs/10-performance.md).
// Starts the built web app, loads each route's HTML, gzips every <script src>
// it references and fails if a route's total is over its group's budget.
// Run after `pnpm build`: `pnpm budget`.

import { spawn } from "node:child_process";
import { gzipSync } from "node:zlib";

const PORT = Number(process.env.BUDGET_PORT ?? 3123);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const KB = 1024;

/** Route → budget in gzip bytes. Add routes as they ship. */
const budgets = [
  { group: "marketing", limit: 145 * KB, routes: ["/"] },
  // { group: "app shell", limit: 195 * KB, routes: ["/home"] },
  // { group: "game", limit: 195 * KB, routes: ["/play/demo"] },
];

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
  stopServer();
  process.exit(failed ? 1 : 0);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  stopServer();
  process.exit(1);
}
