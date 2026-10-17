import { CloseCode } from "@gamehub/protocol/constants";
import type { ClientPresenceMsg, ServerPresenceMsg } from "@gamehub/protocol";
import PartySocket from "partysocket";

/** One presence socket per tab (signed-in pages); no redirect when signed out, it just stops. */
export function connectPresence(onMessage: (m: ServerPresenceMsg) => void, onOpen: () => void) {
  let stopped = false;
  const socket = new PartySocket({
    host: process.env.NEXT_PUBLIC_REALTIME_HOST ?? "localhost:8787",
    party: "presence",
    room: "global",
    query: async () => {
      const res = await fetch(`/api/realtime/ticket?scope=presence`, { cache: "no-store" });
      if (!res.ok) {
        stopped = true;
        socket.close();
        throw new Error(`ticket ${res.status}`);
      }
      return { ticket: ((await res.json()) as { ticket: string }).ticket };
    },
    minReconnectionDelay: 1000,
    maxReconnectionDelay: 30_000,
    reconnectionDelayGrowFactor: 1.6,
    maxRetries: Infinity,
    maxEnqueuedMessages: 0,
  });
  socket.addEventListener("open", onOpen);
  socket.addEventListener("message", (e: MessageEvent<string>) => {
    try {
      onMessage(JSON.parse(e.data) as ServerPresenceMsg);
    } catch {
      // ignore malformed frames
    }
  });
  socket.addEventListener("close", (e: CloseEvent) => {
    if (e.code === CloseCode.Replaced || stopped) socket.close();
  });
  return {
    send(m: ClientPresenceMsg) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(m));
    },
    close: () => socket.close(),
  };
}
