"use client";

import type { RpsRules, RpsView, Throw } from "@gamehub/engine/rps";
import type { ClientRoomMsg } from "@gamehub/protocol";
import { useSyncExternalStore } from "react";
import { useRoom, type Snapshot } from "@/lib/room/store";
import { DuelView } from "./duel-view";
import { PodiumCard } from "./podium-card";
import { useReveal } from "./use-reveal";
import { WaitingView } from "./waiting-view";

const subscribeMotion = (cb: () => void) => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Props = { snap: Snapshot; send: (m: ClientRoomMsg) => void };

export default function RpsTable({ snap, send }: Props) {
  const offset = useRoom((s) => s.offset);
  const pending = useRoom((s) => s.pending);
  const connection = useRoom((s) => s.connection);
  const reduce = useSyncExternalStore(subscribeMotion, reducedMotion, () => false);
  const view = snap.view as RpsView;
  const rules = snap.room.rules as RpsRules;
  const me = snap.you;
  const ended = snap.room.phase === "ended";

  // Every match I've played in, oldest first. The newest reveal may belong to a match that
  // just finished even though the same update already put me in the next one.
  const mine =
    me === "spectator"
      ? []
      : view.rounds.flatMap((round, r) =>
          round
            .filter((m) => (m.a === me || m.b === me) && m.a !== null && m.b !== null)
            .map((m) => ({ r, m })),
        );
  const totalThrows = mine.reduce((n, x) => n + x.m.history.length, 0);
  const revealFrom = [...mine].reverse().find((x) => x.m.history.length > 0)?.m;
  const phase = useReveal(totalThrows, revealFrom?.history.at(-1), reduce);
  const current = mine.find((x) => x.r === view.round && x.m.winner === null)?.m;
  const live = !!current;
  // While a reveal plays, keep showing the match it came from.
  const myMatch = phase.kind !== "idle" && revealFrom ? revealFrom : current;

  const pendingPick =
    pending && typeof pending.action === "object" && pending.action && "pick" in pending.action
      ? ((pending.action as { pick: Throw }).pick ?? null)
      : null;
  const canThrow =
    me !== "spectator" &&
    live &&
    myMatch === current &&
    !!myMatch &&
    !ended &&
    connection === "open" &&
    pending === null &&
    myMatch.mine === undefined &&
    !myMatch.thrown.includes(me);

  function onThrow(pick: Throw) {
    if (!canThrow) return;
    const action = { type: "throw" as const, pick };
    const id = crypto.randomUUID();
    useRoom.setState({ pending: { id, action } });
    send({ t: "act", id, v: snap.v, a: action });
  }

  const showDuel = me !== "spectator" && myMatch && (live || phase.kind !== "idle");
  return (
    <>
      {showDuel ? (
        <DuelView
          match={myMatch}
          me={me}
          seats={snap.seats}
          rules={rules}
          turns={snap.deadlines.turns ?? {}}
          graceEndsAt={snap.deadlines.graceEndsAt}
          offset={offset}
          phase={phase}
          canThrow={canThrow}
          pendingPick={pendingPick}
          onThrow={onThrow}
        />
      ) : (
        <WaitingView view={view} me={me} seats={snap.seats} />
      )}
      {ended && phase.kind === "idle" ? (
        <PodiumCard
          view={view}
          seats={snap.seats}
          you={me}
          onRematch={() => send({ t: "rematch" })}
        />
      ) : null}
    </>
  );
}
