"use client";

import {
  GROUP_COLOUR,
  groupOf,
  naira,
  netWorth,
  plotsOf,
  SPACES,
  type PlotsRules,
  type PlotsView,
} from "@gamehub/engine/plots";
import type { SeatPublic } from "@gamehub/protocol";
import { Dialog } from "@gamehub/ui/overlays/dialog";
import { Bot, WifiOff } from "lucide-react";
import { seatName } from "../rps/names";
import { ThinkingRing, TimerRing } from "../timer-ring";
import { Token, TOKEN_NAMES } from "./tokens";

const SIZE = 30;

/** Everyone's chip above the board: token, name, cash; the player being waited on is lit. */
export function PlayersStrip({
  view,
  seats,
  me,
  waiting,
  deadlines,
  turnMs,
  offset,
  onPick,
}: {
  view: PlotsView;
  seats: SeatPublic[];
  me: number | null;
  waiting: number[];
  deadlines: Partial<Record<number, number>> | undefined;
  turnMs: number;
  offset: number;
  onPick: (seat: number) => void;
}) {
  return (
    <ul
      className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none]"
      aria-label="Players"
    >
      {view.order.map((seat) => {
        const info = seats[seat];
        if (!info) return null;
        const out = view.out.includes(seat);
        const active = waiting.includes(seat) && !view.places;
        const due = deadlines?.[seat];
        const bot = info.status === "bot" || !info.userId;
        const name =
          seat === me ? "You" : seatName(seats, seat).replace(/ \((Easy|Medium|Hard)\)$/, "");
        return (
          <li key={seat} className="shrink-0">
            <button
              type="button"
              onClick={() => onPick(seat)}
              aria-label={`${seatName(seats, seat)}, ${TOKEN_NAMES[seat % 8]}: ${out ? "bankrupt" : naira(view.cash[seat] ?? 0)}${active ? ", playing now" : ""}`}
              className={`flex items-center gap-1.5 rounded-control border bg-surface py-1 pr-2.5 pl-1 transition-colors duration-(--dur-turn) ${active ? "border-accent" : "border-line"} ${out ? "opacity-45" : ""}`}
            >
              <span
                className="relative shrink-0"
                style={{ width: SIZE, height: SIZE }}
                aria-hidden="true"
              >
                <span className="absolute inset-[3px]">
                  <Token seat={seat} />
                </span>
                {active && due && !bot ? (
                  <TimerRing key={due} endsAt={due} totalMs={turnMs} offset={offset} size={SIZE} />
                ) : active ? (
                  <ThinkingRing size={SIZE} />
                ) : null}
                {info.status === "away" ? (
                  <span className="absolute -top-1 -right-1 rounded-full bg-surface p-px text-ink-2">
                    <WifiOff size={10} />
                  </span>
                ) : info.status === "bot" && info.userId ? (
                  <span className="absolute -top-1 -right-1 rounded-full bg-surface p-px text-ink-2">
                    <Bot size={10} />
                  </span>
                ) : null}
              </span>
              <span className="text-left" aria-hidden="true">
                <span
                  className={`block max-w-24 truncate text-xs leading-tight ${active ? "font-bold" : "font-semibold"}`}
                >
                  {name}
                </span>
                <span className="block text-xs leading-tight font-semibold text-ink-2 tabular-nums">
                  {out ? "Out" : naira(view.cash[seat] ?? 0)}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** A player's plots, cash and net worth. */
export function PlayerSheet({
  seat,
  view,
  rules,
  seats,
  onPlot,
  onClose,
}: {
  seat: number | null;
  view: PlotsView;
  rules: PlotsRules;
  seats: SeatPublic[];
  onPlot: (space: number) => void;
  onClose: () => void;
}) {
  if (seat === null) return null;
  const plots = plotsOf(view, seat);
  return (
    <Dialog
      open
      onClose={onClose}
      title={seatName(seats, seat)}
      description={`${TOKEN_NAMES[seat % 8]} · cash ${naira(view.cash[seat] ?? 0)} · net worth ${naira(netWorth(view, seat, rules))}`}
    >
      {plots.length ? (
        <ul className="grid grid-cols-2 gap-1.5">
          {plots.map((p) => {
            const g = groupOf(p);
            const h = view.houses[p] ?? 0;
            return (
              <li key={p}>
                <button
                  type="button"
                  onClick={() => onPlot(p)}
                  className="flex w-full items-center gap-2 rounded-control border border-line px-2 py-1.5 text-left text-sm"
                >
                  <span
                    className="h-6 w-1.5 shrink-0 rounded-full"
                    style={{ background: g ? GROUP_COLOUR[g] : "#8A8E94" }}
                  />
                  <span className="min-w-0 flex-1 truncate font-semibold">{SPACES[p]?.name}</span>
                  <span className="text-xs text-ink-2">
                    {view.mortgaged[p] ? "M" : h === 5 ? "Hotel" : h ? `${h}h` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-ink-2">No plots yet.</p>
      )}
    </Dialog>
  );
}
