import { beforeEach, describe, expect, it } from "vitest";
import { receive, resetRoom, useRoom, type Snapshot } from "./store";

const snap = (v: number): Snapshot => ({
  t: "snapshot",
  v,
  room: {
    roomId: "R",
    code: "ABC234",
    kind: "private",
    game: "tictactoe",
    phase: "playing",
    ranked: false,
    rules: {},
    size: 2,
    minPlayers: 2,
    botFill: null,
    firstPlayer: "random",
  },
  seats: [],
  you: 0,
  view: null,
  deadlines: {},
  serverNow: 10_000,
});

describe("room store", () => {
  beforeEach(resetRoom);

  it("ignores snapshots older than the one it has", () => {
    receive(snap(5));
    receive(snap(3));
    expect(useRoom.getState().snap?.v).toBe(5);
  });

  it("keeps an acked action pending until the snapshot with it arrives, and counts rejects", () => {
    receive(snap(5));
    useRoom.setState({ pending: { id: "a1", action: {} } });
    receive({ t: "ack", id: "a1", v: 6 });
    expect(useRoom.getState().pending).not.toBeNull(); // no flash of the old position
    receive(snap(6));
    expect(useRoom.getState().pending).toBeNull();
    // Already have that snapshot: the ack settles it at once.
    useRoom.setState({ pending: { id: "a3", action: {} } });
    receive({ t: "ack", id: "a3", v: 6 });
    expect(useRoom.getState().pending).toBeNull();
    useRoom.setState({ pending: { id: "a2", action: {} } });
    receive({ t: "reject", id: "a2", code: "NOT_YOUR_TURN", v: 6 });
    expect(useRoom.getState()).toMatchObject({ pending: null, rejects: 1 });
  });

  it("estimates server clock offset from pongs", () => {
    receive({ t: "pong", c: 1000, s: 5100 }, 1200);
    expect(useRoom.getState()).toMatchObject({ rtt: 200, offset: 4000 });
  });
});
