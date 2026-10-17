import type {
  ServerTournamentMsg,
  TournamentErrorCode,
  TournamentEventMsg,
} from "@gamehub/protocol";
import { create } from "zustand";

export type TSnapshot = Extract<ServerTournamentMsg, { t: "t_snapshot" }>;

type TournamentState = {
  connection: "connecting" | "open" | "reconnecting" | "closed";
  closedCode: number | null;
  snap: TSnapshot | null;
  /** serverNow − clientNow. */
  offset: number;
  /** "Your table is ready": the room to go to, until handled. */
  go: { table: string; code: string; at: number } | null;
  notice: { code: TournamentErrorCode; detail?: string[] } | null;
  /** Recent bracket events, newest last. */
  events: TournamentEventMsg[];
};

const initial: TournamentState = {
  connection: "connecting",
  closedCode: null,
  snap: null,
  offset: 0,
  go: null,
  notice: null,
  events: [],
};

export const useTournament = create<TournamentState>(() => initial);
export const resetTournament = () => useTournament.setState(initial, true);

export function receiveT(msg: ServerTournamentMsg, now = Date.now()) {
  const s = useTournament.getState();
  switch (msg.t) {
    case "t_snapshot":
      if (s.snap && msg.v < s.snap.v) return;
      useTournament.setState({ snap: msg, offset: msg.serverNow - now });
      return;
    case "t_go":
      useTournament.setState({ go: { table: msg.table, code: msg.code, at: now } });
      return;
    case "t_event": {
      const { t: _t, ...e } = msg;
      useTournament.setState({ events: [...s.events.slice(-19), e as TournamentEventMsg] });
      return;
    }
    case "error":
      useTournament.setState({
        notice: { code: msg.code, ...(msg.detail ? { detail: msg.detail } : {}) },
      });
      return;
    case "pong":
      return;
  }
}
