"use client";

import type { PendingPick, Shape } from "@gamehub/engine/whot";
import { CardBack, cardLabel, SHAPE_NAMES, ShapeIcon, WhotCard } from "./whot-card";

/** Small, stable tilt per card so the pile looks thrown, not stacked. */
function tilt(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return { r: (h % 13) - 6, x: ((h >> 4) % 7) - 3, y: ((h >> 8) % 5) - 2 };
}

type Props = {
  pile: string[];
  callShape: Shape | null;
  marketCount: number;
  pendingPick: PendingPick | null;
  canMarket: boolean;
  onMarket: () => void;
};

/** Market (tap to pick) and the call card pile, side by side. */
export function Centre({ pile, callShape, marketCount, pendingPick, canMarket, onMarket }: Props) {
  const top = pile.at(-1) ?? "";
  return (
    <div className="flex items-start justify-center gap-8">
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={onMarket}
          disabled={!canMarket}
          aria-label={
            pendingPick
              ? `Pick ${pendingPick.amount} from the market`
              : `Go to market, ${marketCount} cards left`
          }
          className={`relative rounded-playing-card transition-transform duration-(--dur-press) active:scale-95 disabled:cursor-default ${canMarket ? "ring-2 ring-accent ring-offset-2 ring-offset-paper" : ""}`}
        >
          {marketCount > 2 ? (
            <span className="absolute top-1 left-1" aria-hidden="true">
              <CardBack width={72} />
            </span>
          ) : null}
          {marketCount > 1 ? (
            <span className="absolute top-0.5 left-0.5" aria-hidden="true">
              <CardBack width={72} />
            </span>
          ) : null}
          <span className={`relative block ${marketCount === 0 ? "opacity-30" : ""}`}>
            <CardBack width={72} />
          </span>
          {pendingPick ? (
            <span className="absolute -top-2.5 -right-3 rounded-full bg-danger px-2 py-0.5 text-sm font-bold text-white shadow-sm">
              Pick {pendingPick.amount}
            </span>
          ) : null}
        </button>
        <span className="text-xs font-semibold text-ink-2 tabular-nums">
          Market · {marketCount}
        </span>
      </div>

      <div className="flex flex-col items-center gap-2">
        <div
          className="relative"
          style={{ width: 72, height: 106 }}
          aria-label={`Call card: ${cardLabel(top)}`}
          role="img"
        >
          {pile.map((id, i) => {
            const t = i === pile.length - 1 ? { r: 0, x: 0, y: 0 } : tilt(id);
            return (
              <span
                key={`${id}-${i}`}
                className="absolute inset-0 transition-[translate,rotate] duration-(--dur-card) ease-standard starting:translate-y-6 starting:opacity-0"
                style={{ rotate: `${t.r}deg`, translate: `${t.x}px ${t.y}px` }}
              >
                <span className="block rounded-playing-card shadow-sm">
                  <WhotCard id={id} width={72} />
                </span>
              </span>
            );
          })}
        </div>
        {callShape ? (
          <span className="flex items-center gap-1.5 rounded-full bg-whot px-2.5 py-0.5 text-xs font-bold text-white">
            Calling <ShapeIcon shape={callShape} size={12} /> {SHAPE_NAMES[callShape]}
          </span>
        ) : (
          <span className="text-xs font-semibold text-ink-2">Call card</span>
        )}
      </div>
    </div>
  );
}
