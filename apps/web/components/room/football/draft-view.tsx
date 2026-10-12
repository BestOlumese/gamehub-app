"use client";

import {
  bestRole,
  chemistry,
  formation,
  FORMATIONS,
  teamRating,
  type Card,
  type FootballAction,
  type FootballPlayer,
  type FootballView,
} from "@gamehub/engine/football";
import { TimerRing } from "../timer-ring";
import { Pitch } from "./pitch";
import { PlayerCard } from "./player-card";

type Me = NonNullable<FootballView["me"]>;

/** Rating and chemistry of the team so far (same code as the server). */
export function teamNumbers(me: Pick<Me, "formation" | "xi">, cards: Record<string, Card>) {
  if (!me.formation) return { rating: 0, chem: [] as number[], chemTotal: 0 };
  const slots = formation(me.formation).slots;
  const placed = slots.flatMap((s, i) => {
    const c = cards[me.xi[i] ?? ""];
    return c
      ? [{ player: c as unknown as FootballPlayer, pos: s.pos, role: bestRole(c, s.pos) }]
      : [];
  });
  const pts = chemistry(placed);
  const chem: number[] = [];
  let k = 0;
  slots.forEach((_, i) => (chem[i] = cards[me.xi[i] ?? ""] ? (pts[k++] ?? 0) : 0));
  return { rating: teamRating(placed), chem, chemTotal: pts.reduce((a, b) => a + b, 0) };
}

const STEP_NAME: Record<string, string> = {
  formation: "Pick your formation",
  captain: "Pick your captain",
  sub: "Pick a sub",
};

/** The draft (design: pitch on top filling up, the five options in a sideways row below). */
export function DraftView({
  me,
  cards,
  offset,
  turnSeconds,
  ready,
  act,
}: {
  me: Me;
  cards: Record<string, Card>;
  offset: number;
  turnSeconds: number;
  ready: boolean;
  act: (a: FootballAction) => void;
}) {
  const offer = me.offer;
  const { rating, chem, chemTotal } = teamNumbers(me, cards);
  if (!offer) return null;
  const slotPos =
    offer.kind === "slot" && me.formation
      ? formation(me.formation).slots[offer.slot]?.pos
      : undefined;
  const title =
    offer.kind === "slot"
      ? `Pick your ${slotPos}`
      : offer.kind === "sub"
        ? `Pick a sub (${offer.group})`
        : (STEP_NAME[offer.kind] ?? "Pick");
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="relative flex size-11 shrink-0 items-center justify-center">
          {me.deadline ? (
            <TimerRing
              key={me.deadline}
              endsAt={me.deadline}
              totalMs={turnSeconds * 1000}
              offset={offset}
              size={44}
            />
          ) : null}
          <span className="absolute text-xs font-bold tabular-nums">
            {me.pick + 1}/{me.total}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold">{title}</p>
          <p className="text-sm text-ink-2 tabular-nums">
            Rating {rating || "–"} · Chemistry {chemTotal}/33
          </p>
        </div>
      </div>

      {offer.kind === "formation" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {offer.ids.map((id) => {
            const f = FORMATIONS.find((x) => x.id === id);
            return (
              <button
                key={id}
                type="button"
                disabled={!ready}
                onClick={() => act({ type: "pick", choice: id })}
                className="flex flex-col gap-2 rounded-card border border-line bg-surface p-2 text-left shadow-sm active:scale-[0.98]"
              >
                <Pitch formationId={id as number} xi={{}} cards={{}} compact tiny />
                <span className="font-bold">{f?.name}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <Pitch
            formationId={me.formation}
            xi={me.xi}
            cards={cards}
            chem={chem}
            glow={offer.kind === "slot" ? offer.slot : null}
            compact
          />
          {me.subs.length ? (
            <p className="truncate text-xs text-ink-2">
              Bench: {me.subs.map((id) => cards[id]?.short).join(", ")}
            </p>
          ) : null}
          <div
            className="-mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-2"
            role="listbox"
            aria-label="Your options"
          >
            {offer.ids.map((id) => {
              const c = cards[id as string];
              if (!c) return null;
              return (
                <div key={id} className="w-[44%] max-w-48 shrink-0 snap-start sm:w-44">
                  <PlayerCard
                    card={c}
                    slot={slotPos}
                    onClick={ready ? () => act({ type: "pick", choice: id }) : undefined}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
