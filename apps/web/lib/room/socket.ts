import { CloseCode } from "@gamehub/protocol/constants";
import type { ClientRoomMsg, ServerRoomMsg } from "@gamehub/protocol";
import PartySocket from "partysocket";
import { receive, useRoom } from "./store";

/** Close codes that mean "don't come back" (docs/03-realtime-protocol.md). */
const FINAL = new Set<number>([
  CloseCode.Normal,
  CloseCode.Replaced,
  CloseCode.RoomGone,
  CloseCode.Kicked,
]);

async function fetchTicket(code: string): Promise<string> {
  const res = await fetch(`/api/realtime/ticket?scope=room:${code}`, { cache: "no-store" });
  if (res.status === 401) {
    // Full navigation: the session is gone, so drop all client state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/login?next=${encodeURIComponent(`/r/${code}`)}`);
    throw new Error("signed out");
  }
  if (!res.ok) throw new Error(`ticket ${res.status}`);
  return ((await res.json()) as { ticket: string }).ticket;
}

export type RoomConnection = { send: (m: ClientRoomMsg) => void; close: () => void };

export function connectRoom(code: string): RoomConnection {
  const socket = new PartySocket({
    host: process.env.NEXT_PUBLIC_REALTIME_HOST ?? "localhost:8787",
    party: "room",
    room: code,
    // Fresh 60 s ticket on every (re)connect.
    query: async () => ({ ticket: await fetchTicket(code) }),
    minReconnectionDelay: 300,
    maxReconnectionDelay: 8000,
    reconnectionDelayGrowFactor: 1.6,
    maxRetries: Infinity,
    // Never replay game actions queued while offline; the player re-decides after the snapshot.
    maxEnqueuedMessages: 0,
  });

  const send = (m: ClientRoomMsg) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(m));
  };

  socket.addEventListener("open", () => {
    useRoom.setState({ connection: "open", droppedAt: null });
    send({ t: "hello", lastV: useRoom.getState().snap?.v });
    send({ t: "ping", c: Date.now() });
  });
  socket.addEventListener("message", (e: MessageEvent<string>) => {
    try {
      receive(JSON.parse(e.data) as ServerRoomMsg);
    } catch {
      // ignore malformed frames
    }
  });
  socket.addEventListener("close", (e: CloseEvent) => {
    if (FINAL.has(e.code)) {
      socket.close();
      useRoom.setState({ connection: "closed", closedCode: e.code, pending: null });
      return;
    }
    const s = useRoom.getState();
    useRoom.setState({
      connection: "reconnecting",
      droppedAt: s.droppedAt ?? Date.now(),
      pending: null,
    });
  });

  // Come back the moment the tab is visible or the network returns.
  const kick = () => {
    if (socket.readyState !== WebSocket.OPEN && useRoom.getState().connection !== "closed")
      socket.reconnect();
  };
  const onVisible = () => document.visibilityState === "visible" && kick();
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", kick);
  const ping = setInterval(() => send({ t: "ping", c: Date.now() }), 10_000);

  return {
    send,
    close() {
      clearInterval(ping);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", kick);
      socket.close();
    },
  };
}
