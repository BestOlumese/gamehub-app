"use client";

import type { SeatPublic } from "@gamehub/protocol";
import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Bot, Crown } from "lucide-react";
import type { ReactNode } from "react";
import { seatName } from "./rps/names";

function Face({ seat, size }: { seat: SeatPublic | undefined; size: number }) {
  if (seat && !seat.userId)
    return (
      <span
        className="grid place-items-center rounded-full bg-surface-2 text-ink-2"
        style={{ width: size, height: size }}
      >
        <Bot size={size / 2} aria-hidden="true" />
      </span>
    );
  return <Avatar username={seat?.name || "?"} image={seat?.avatar} size={size} />;
}

const STEP = ["h-20", "h-14", "h-10"];

/** Top three on blocks: 2nd, 1st, 3rd. */
function Podium({ places, seats }: { places: number[][]; seats: SeatPublic[] }) {
  const top = places.slice(0, 3);
  const order = [1, 0, 2].filter((i) => top[i]?.length);
  return (
    <div
      className="mx-6 flex items-end justify-center gap-2 border-b-2 border-line-edge pt-5"
      aria-hidden="true"
    >
      {order.map((i) => {
        const seat = top[i]?.[0] ?? 0;
        return (
          <div key={i} className="flex w-24 flex-col items-center gap-1.5">
            <Face seat={seats[seat]} size={i === 0 ? 44 : 36} />
            <span className="w-full truncate text-center text-xs font-bold">
              {seatName(seats, seat)}
              {(top[i]?.length ?? 0) > 1 ? ` +${(top[i]?.length ?? 1) - 1}` : ""}
            </span>
            <span
              className={`${STEP[i]} grid w-full place-items-start justify-center rounded-t-control border border-b-0 border-line bg-(--g-soft) pt-1.5 font-display text-xl font-extrabold text-(--g)`}
            >
              {i + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The game's colour with its pattern, the winner crowned, the title and the woven strip. */
export function ResultHeader({
  labelId,
  title,
  sub,
  winner,
  seats,
  className = "",
}: {
  labelId?: string;
  title: ReactNode;
  sub?: ReactNode;
  winner: number | null;
  seats: SeatPublic[];
  className?: string;
}) {
  return (
    <header
      className={`relative overflow-hidden bg-(--g) px-6 pt-5 pb-7 text-center text-white ${className}`}
    >
      <span aria-hidden="true" className="pat-white absolute inset-0" />
      {winner !== null ? (
        <div className="relative mx-auto flex w-fit flex-col items-center">
          <Crown
            size={26}
            className="-mb-1.5 text-accent drop-shadow-[0_2px_0_rgb(0_0_0/0.25)]"
            fill="currentColor"
            aria-hidden="true"
          />
          <span className="rounded-full border-4 border-white/90 shadow-[0_3px_0_rgb(0_0_0/0.2)]">
            <Face seat={seats[winner]} size={56} />
          </span>
        </div>
      ) : null}
      <h2
        id={labelId}
        className="relative mt-2 font-display text-3xl leading-tight font-extrabold tracking-tight break-words"
      >
        {title}
      </h2>
      {sub ? <p className="relative mt-1 text-sm font-semibold text-white/85">{sub}</p> : null}
      <span aria-hidden="true" className="strip absolute inset-x-0 bottom-0" />
    </header>
  );
}

/**
 * The end-of-game card every game uses: the game's colour across the top with its pattern,
 * the winner crowned, the woven strip, a podium for three or more players, then the details.
 */
export function ResultShell({
  game,
  labelId,
  title,
  sub,
  winner,
  places,
  seats,
  children,
}: {
  game: string;
  labelId: string;
  title: ReactNode;
  sub?: ReactNode;
  /** The seat to crown, or null (a draw). */
  winner: number | null;
  /** Places, best first; a podium shows when three or more people finished. */
  places?: number[][];
  seats: SeatPublic[];
  children: ReactNode;
}) {
  const podium = places && places.flat().length >= 3 ? places : null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 sm:pb-8">
      <div
        role="dialog"
        aria-labelledby={labelId}
        className={`tone-${game} mx-auto max-h-[88dvh] max-w-md overflow-y-auto rounded-card border border-line bg-surface shadow-lg transition-[translate,opacity] duration-(--dur-sheet) ease-standard starting:translate-y-full starting:opacity-0`}
      >
        <ResultHeader labelId={labelId} title={title} sub={sub} winner={winner} seats={seats} />
        {podium ? <Podium places={podium} seats={seats} /> : null}
        <div className={`px-6 pb-6 ${podium ? "" : "pt-5"}`}>{children}</div>
      </div>
    </div>
  );
}
