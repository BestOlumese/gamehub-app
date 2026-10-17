import { CloseCode } from "@gamehub/protocol/constants";
import type { ClientTournamentMsg, ServerTournamentMsg } from "@gamehub/protocol";
import PartySocket from "partysocket";
import { receiveT, useTournament } from "./store";

const FINAL = new Set<number>([CloseCode.Replaced, CloseCode.RoomGone]);

async function fetchTicket(code: string): Promise<string> {
  const res = await fetch(`/api/realtime/ticket?scope=tournament:${code}`, { cache: "no-store" });
  if (res.status === 401) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/login?next=${encodeURIComponent(`/t/${code}`)}`);
    throw new Error("signed out");
  }
  if (!res.ok) throw new Error(`ticket ${res.status}`);
  return ((await res.json()) as { ticket: string }).ticket;
}

export type TournamentConnection = { send: (m: ClientTournamentMsg) => void; close: () => void };

/** The tournament page's socket (same reconnect rules as rooms). */
export function connectTournament(code: string): TournamentConnection {
  const socket = new PartySocket({
    host: process.env.NEXT_PUBLIC_REALTIME_HOST ?? "localhost:8787",
    party: "tournament",
    room: code,
    query: async () => ({ ticket: await fetchTicket(code) }),
    minReconnectionDelay: 300,
    maxReconnectionDelay: 8000,
    reconnectionDelayGrowFactor: 1.6,
    maxRetries: Infinity,
    maxEnqueuedMessages: 0,
  });
  const send = (m: ClientTournamentMsg) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(m));
  };
  socket.addEventListener("open", () => {
    useTournament.setState({ connection: "open" });
    send({ t: "t_hello" });
  });
  socket.addEventListener("message", (e: MessageEvent<string>) => {
    try {
      receiveT(JSON.parse(e.data) as ServerTournamentMsg);
    } catch {
      // ignore malformed frames
    }
  });
  socket.addEventListener("close", (e: CloseEvent) => {
    if (FINAL.has(e.code)) {
      socket.close();
      useTournament.setState({ connection: "closed", closedCode: e.code });
      return;
    }
    useTournament.setState({ connection: "reconnecting" });
  });
  const kick = () => {
    if (socket.readyState !== WebSocket.OPEN && useTournament.getState().connection !== "closed")
      socket.reconnect();
  };
  const onVisible = () => document.visibilityState === "visible" && kick();
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", kick);
  return {
    send,
    close() {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", kick);
      socket.close();
    },
  };
}
