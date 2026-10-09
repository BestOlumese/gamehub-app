import type { RoomErrorCode, ServerRoomMsg } from "@gamehub/protocol";
import { create } from "zustand";

export type Snapshot = Extract<ServerRoomMsg, { t: "snapshot" }>;
export type RoomEvent = Extract<ServerRoomMsg, { t: "event" }>["e"];

export type Connection = "connecting" | "open" | "reconnecting" | "closed";

type RoomState = {
  connection: Connection;
  /** Close code that ended the session for good (4001 replaced, 4004 gone, 4008 kicked, 1000 left). */
  closedCode: number | null;
  /** Client time the socket last dropped; drives the "Reconnecting…" banner. */
  droppedAt: number | null;
  snap: Snapshot | null;
  /** serverNow − clientNow, from pongs; corrects countdowns. */
  offset: number;
  rtt: number | null;
  /** Optimistic action waiting for the server. */
  pending: { id: string; action: unknown } | null;
  /** Bumped on every rejected action so the board can shake. */
  rejects: number;
  /** Recent game events, oldest first; `n` only ever goes up (one action can send several). */
  events: Array<{ n: number; e: RoomEvent }>;
  /** Mirrors the player's sound setting (the room menu can change it mid-game). */
  soundOn: boolean;
  notice: RoomErrorCode | null;
};

const initial: RoomState = {
  connection: "connecting",
  closedCode: null,
  droppedAt: null,
  snap: null,
  offset: 0,
  rtt: null,
  pending: null,
  rejects: 0,
  events: [],
  soundOn: true,
  notice: null,
};

export const useRoom = create<RoomState>(() => initial);

export const resetRoom = () => useRoom.setState(initial, true);

/** Applies one server message to the store. Pure state changes, no I/O. */
export function receive(msg: ServerRoomMsg, now = Date.now()) {
  const s = useRoom.getState();
  switch (msg.t) {
    case "snapshot":
      if (s.snap && msg.v < s.snap.v) return; // stale
      useRoom.setState({
        snap: msg,
        offset: s.rtt === null ? msg.serverNow - now : s.offset,
        // A snapshot at or past our pending action's version settles it either way.
        pending: s.pending && s.snap && msg.v > s.snap.v ? null : s.pending,
      });
      return;
    case "ack":
      // The ack comes a moment before the snapshot with the move in it. Dropping the pending
      // action now would flash the old position (a chess piece jumping back, a Whot card
      // reappearing), so it stays until that snapshot arrives, unless we already have it.
      if (s.pending?.id === msg.id && (!s.snap || s.snap.v >= msg.v))
        useRoom.setState({ pending: null });
      return;
    case "reject":
      useRoom.setState({ pending: null, rejects: s.rejects + 1 });
      return;
    case "event":
      useRoom.setState({
        events: [...s.events.slice(-11), { n: (s.events.at(-1)?.n ?? 0) + 1, e: msg.e }],
      });
      return;
    case "pong": {
      const rtt = now - msg.c;
      useRoom.setState({ rtt, offset: msg.s - (msg.c + rtt / 2) });
      return;
    }
    case "error":
      useRoom.setState({ notice: msg.code });
      return;
    case "ended":
      return; // the matching snapshot carries the final state
  }
}
