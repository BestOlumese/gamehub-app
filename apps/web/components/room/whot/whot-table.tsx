"use client";

import {
  canDeclareLastCard,
  playableCards,
  whyNotPlayable,
  type Shape,
  type WhotAction,
  type WhotRules,
  type WhotView,
} from "@gamehub/engine/whot";
import type { ClientRoomMsg } from "@gamehub/protocol";
import { Check } from "lucide-react";
import { useState } from "react";
import { useRoom, type Snapshot } from "@/lib/room/store";
import { seatName } from "../rps/names";
import { SeatChip } from "../seat-chip";
import { Centre } from "./centre";
import { Hand } from "./hand";
import { Opponents } from "./opponents";
import { placeLabels, ResultSheet } from "./result-sheet";
import { ShapePicker } from "./shape-picker";
import { useWhotFeed } from "./use-whot-feed";

type Props = { snap: Snapshot; send: (m: ClientRoomMsg) => void };

/** Opponents on top, market and call card in the middle, your fanned hand at the bottom. */
export default function WhotTable({ snap, send }: Props) {
  const offset = useRoom((s) => s.offset);
  const pending = useRoom((s) => s.pending);
  const rejects = useRoom((s) => s.rejects);
  const connection = useRoom((s) => s.connection);
  const view = snap.view as WhotView;
  const rules = snap.room.rules as WhotRules;
  const me = snap.you === "spectator" ? null : snap.you;
  const ended = snap.room.phase === "ended" || view.over;
  const feed = useWhotFeed(snap.seats, me);
  const [whotCard, setWhotCard] = useState<{ card: string; checkUp: boolean } | null>(null);
  const [hint, setHint] = useState<{ text: string; at: number } | null>(null);

  const hand = view.you?.hand ?? [];
  const myTurn = me !== null && !ended && view.turn === me;
  const canAct = myTurn && connection === "open" && pending === null;
  const ctx = { top: view.top, callShape: view.callShape, pendingPick: view.pendingPick };
  const playable = new Set(myTurn ? playableCards(hand, ctx, rules) : []);
  const pendingAction = pending?.action as WhotAction | undefined;
  const hidden = pendingAction?.type === "play" ? pendingAction.card : null;
  const declared = me !== null && !!view.lastCardDeclared[me];
  const checkUpDue = rules.checkUpRequired && hand.length === 1;

  const clockFor = (seat: number) => {
    const endsAt = snap.deadlines.turns?.[seat];
    return !ended && view.turn === seat && endsAt
      ? { endsAt, totalMs: rules.turnSeconds * 1000 }
      : null;
  };

  function act(action: WhotAction) {
    const id = crypto.randomUUID();
    useRoom.setState({ pending: { id, action } });
    send({ t: "act", id, v: snap.v, a: action });
  }

  function refuse(text: string) {
    setHint({ text, at: Date.now() });
    useRoom.setState({ rejects: useRoom.getState().rejects + 1 });
    const at = Date.now();
    setTimeout(() => setHint((h) => (h?.at === at ? null : h)), 2400);
  }

  function play(card: string, checkUp = false) {
    if (!canAct) return;
    const why = whyNotPlayable(card, { ...ctx, handSize: hand.length }, rules);
    if (why) return refuse(why);
    if (checkUpDue && !checkUp) return refuse("Tap Check up to win");
    if (card.startsWith("whot")) return setWhotCard({ card, checkUp });
    act(checkUp ? { type: "play", card, checkUp } : { type: "play", card });
  }

  function callShape(shape: Shape) {
    if (!whotCard) return;
    const { card, checkUp } = whotCard;
    setWhotCard(null);
    if (!canAct) return;
    act(
      checkUp
        ? { type: "play", card, requestShape: shape, checkUp }
        : { type: "play", card, requestShape: shape },
    );
  }

  const showLastCard =
    rules.mustDeclareLastCard &&
    me !== null &&
    !ended &&
    (canDeclareLastCard(hand.length, myTurn, declared) || (declared && hand.length <= 2));
  const canDeclare = showLastCard && !declared && connection === "open" && pending === null;

  const pick = view.pendingPick;
  const turnName = seatName(snap.seats, view.turn);
  const banner = ended
    ? null
    : !myTurn
      ? { text: `${turnName}'s turn`, you: false }
      : pick
        ? {
            text: playable.size
              ? `Pick ${pick.amount} or defend with a ${pick.kind}`
              : `Pick ${pick.amount}. Tap the market`,
            you: true,
          }
        : view.callShape && !playable.size
          ? { text: `No ${view.callShape}? Go to market`, you: true }
          : view.callShape
            ? { text: `Play a ${view.callShape} or Whot`, you: true }
            : !playable.size
              ? { text: "Nothing to play. Go to market", you: true }
              : { text: "Your turn", you: true };

  const order =
    me === null
      ? snap.seats.map((_, i) => i)
      : Array.from({ length: view.players - 1 }, (_, k) => (me + 1 + k) % view.players);
  const places = placeLabels(view.finished.map((s) => [s]));
  // Nobody emptied their hand: the market ran out and hands were counted.
  const winner = view.places?.[0]?.[0];
  const byCount = winner !== undefined && (view.counts[winner] ?? 0) > 0;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 py-3">
      <Opponents
        seats={snap.seats}
        order={order}
        counts={view.counts}
        turn={ended ? null : view.turn}
        turnClock={clockFor(view.turn)}
        offset={offset}
        lastCard={view.lastCardDeclared}
        places={places}
      />

      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-2">
        <p className="h-6 text-center text-sm font-semibold text-ink-2" aria-live="polite">
          {hint?.text ?? feed ?? ""}
        </p>
        <Centre
          pile={view.pileTop}
          callShape={view.callShape}
          marketCount={view.marketCount}
          pendingPick={pick}
          canMarket={canAct}
          onMarket={() => canAct && act({ type: "market" })}
        />
      </div>

      <div className="h-11" aria-live="polite">
        {banner ? (
          <p
            className={`flex h-11 items-center justify-center rounded-control px-4 text-center font-semibold ${banner.you ? (pick ? "bg-danger-soft text-danger-strong" : "bg-accent text-ink") : "bg-surface-2 text-ink-2"}`}
          >
            {banner.text}
          </p>
        ) : null}
      </div>

      {me !== null ? (
        <>
          <div className="flex h-9 items-center justify-center gap-2">
            {showLastCard ? (
              <button
                type="button"
                disabled={!canDeclare}
                onClick={() => act({ type: "declare_last_card" })}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-extrabold tracking-wide uppercase transition-colors duration-(--dur-press) ${declared ? "bg-brand-soft text-brand-strong" : "bg-accent text-ink motion-safe:animate-pulse"}`}
              >
                {declared ? <Check size={16} aria-hidden="true" /> : null}
                Last card
              </button>
            ) : null}
            {checkUpDue && myTurn && hand[0] && playable.has(hand[0]) ? (
              <button
                type="button"
                disabled={!canAct}
                onClick={() => hand[0] && play(hand[0], true)}
                className="inline-flex h-9 items-center rounded-full bg-brand px-4 text-sm font-extrabold tracking-wide text-white uppercase"
              >
                Check up
              </button>
            ) : null}
          </div>
          <Hand
            hand={hand}
            playable={playable}
            active={myTurn}
            hidden={hidden}
            shakeKey={rejects}
            onPlay={(c) => play(c)}
          />
          <div
            className={`rounded-card border bg-surface p-3 shadow-sm ${myTurn ? "border-accent" : "border-line"}`}
          >
            {snap.seats[me] ? (
              <SeatChip
                seat={snap.seats[me]}
                isYou
                turn={clockFor(me)}
                graceEndsAt={snap.deadlines.graceEndsAt?.[me]}
                offset={offset}
              />
            ) : null}
          </div>
        </>
      ) : (
        <p className="py-6 text-center text-sm text-ink-2">
          You&apos;re watching. Hands stay hidden.
        </p>
      )}

      <ShapePicker open={!!whotCard} onPick={callShape} onClose={() => setWhotCard(null)} />

      {ended && view.over ? (
        <ResultSheet
          view={view}
          seats={snap.seats}
          you={snap.you}
          byCount={byCount}
          onRematch={() => send({ t: "rematch" })}
        />
      ) : null}
    </div>
  );
}
