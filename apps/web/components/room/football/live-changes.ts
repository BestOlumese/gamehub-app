// In a match the server takes one change every 2 s (shouts, tactics, roles, subs) and refuses
// the rest, which made sliders jump back. Changes go through this queue instead: outside a
// match they're sent at once; in one, they wait their turn. A newer change with the same key
// (say, tactics) replaces the one still waiting.
import { useSyncExternalStore } from "react";

/** The server's gap plus a margin for network jitter. */
const GAP_MS = 2200;

let lastSent = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const queue = new Map<string, () => void>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function pump() {
  timer = null;
  const [key, send] = queue.entries().next().value ?? [];
  if (!key || !send) return notify();
  const wait = lastSent + GAP_MS - Date.now();
  if (wait > 0) {
    timer = setTimeout(pump, wait);
    return;
  }
  queue.delete(key);
  lastSent = Date.now();
  send();
  if (queue.size) timer = setTimeout(pump, GAP_MS);
  notify();
}

/** Sends a change now (`live` false) or as soon as the match's change gap allows. */
export function sendChange(key: string, send: () => void, live: boolean) {
  if (!live) {
    queue.delete(key);
    send();
    notify();
    return;
  }
  queue.set(key, send);
  if (!timer) pump();
  else notify();
}

/** Whether a change is still waiting for its turn. */
export function useChangeWaiting(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => queue.size > 0,
    () => false,
  );
}
