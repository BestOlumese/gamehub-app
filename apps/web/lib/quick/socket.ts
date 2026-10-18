import { CloseCode } from "@gamehub/protocol/constants";
import type { ClientMatchMsg, QueueSpecMsg, ServerMatchMsg } from "@gamehub/protocol";
import PartySocket from "partysocket";

async function fetchTicket(): Promise<string> {
  const res = await fetch(`/api/realtime/ticket?scope=match:global`, { cache: "no-store" });
  if (res.status === 401) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(
      `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
    );
    throw new Error("signed out");
  }
  if (res.status === 403) {
    // Banned: tickets are refused from here on.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/banned");
    throw new Error("banned");
  }
  if (!res.ok) throw new Error(`ticket ${res.status}`);
  return ((await res.json()) as { ticket: string }).ticket;
}

/**
 * The quick-match socket. While `queue` is set it (re)joins on every connect, so a dropped
 * connection doesn't lose your place for long (closing the page leaves the queue).
 */
export function connectQueue(
  queue: QueueSpecMsg,
  onMessage: (m: ServerMatchMsg) => void,
  onOpen: (open: boolean) => void,
) {
  let wanted = true;
  const socket = new PartySocket({
    host: process.env.NEXT_PUBLIC_REALTIME_HOST ?? "localhost:8787",
    party: "match",
    room: "global",
    query: async () => ({ ticket: await fetchTicket() }),
    minReconnectionDelay: 300,
    maxReconnectionDelay: 8000,
    reconnectionDelayGrowFactor: 1.6,
    maxRetries: Infinity,
    maxEnqueuedMessages: 0,
  });
  const send = (m: ClientMatchMsg) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(m));
  };
  socket.addEventListener("open", () => {
    onOpen(true);
    send({ t: "mm_hello" });
    if (wanted) send({ t: "mm_join", queue });
  });
  socket.addEventListener("message", (e: MessageEvent<string>) => {
    try {
      onMessage(JSON.parse(e.data) as ServerMatchMsg);
    } catch {
      // ignore malformed frames
    }
  });
  socket.addEventListener("close", (e: CloseEvent) => {
    onOpen(false);
    if (e.code === CloseCode.Replaced) socket.close();
  });
  return {
    keepWaiting: (keep: boolean) => send({ t: "mm_wait", keep }),
    leave() {
      wanted = false;
      send({ t: "mm_leave" });
    },
    close() {
      wanted = false;
      socket.close();
    },
  };
}
