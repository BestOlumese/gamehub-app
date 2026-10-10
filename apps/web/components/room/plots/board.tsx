"use client";

import { CITY_NAME, GROUP_COLOUR, naira, SPACES, type Space } from "@gamehub/engine/plots";
import {
  Banknote,
  Briefcase,
  BusFront,
  Bus,
  Droplet,
  MessageCircle,
  PartyPopper,
  Plane,
  Landmark,
  Shield,
  Siren,
  TrainFront,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cellOf, tokenSpot, TRACKS } from "./geometry";
import { Token, useSeatColour } from "./tokens";

// Cream board, ink lines (decided with Best, Oct 2026; docs/11-design-system.md).
const TILE = "#FFFDF7";
const CORNER = "#F2E6CC";

const ICON: Record<string, LucideIcon> = {
  "Danfo Park": Bus,
  "BRT Terminal": BusFront,
  "Rail Station": TrainFront,
  Airport: Plane,
  "Power Supply": Zap,
  "Water Board": Droplet,
  Gist: MessageCircle,
  Hustle: Briefcase,
  Payday: Banknote,
  "Police Post": Shield,
  Owambe: PartyPopper,
  Checkpoint: Siren,
};

export type TileInfo = {
  owner: number | null;
  houses: number;
  mortgaged: boolean;
};

/** Words for a tile, for screen readers and the plot card. */
export function describeSpace(sp: Space): string {
  if (sp.kind === "plot") return `${sp.name}, ${CITY_NAME[sp.city]}, ${naira(sp.price)}`;
  if (sp.kind === "transport" || sp.kind === "utility") return `${sp.name}, ${naira(sp.price)}`;
  if (sp.kind === "tax") return `${sp.name}: pay ${naira(sp.amount)}`;
  return sp.name;
}

/** Band and owner strip sit on the tile's inner edge (towards the centre). */
const INNER: Record<string, string> = {
  bottom: "flex-col",
  top: "flex-col-reverse",
  left: "flex-row-reverse",
  right: "flex-row",
};

function Houses({ n, vertical }: { n: number; vertical: boolean }) {
  if (!n) return null;
  return (
    <span
      className={`absolute inset-0 flex items-center justify-center gap-[6%] ${vertical ? "flex-col" : ""}`}
      aria-hidden="true"
    >
      {n === 5 ? (
        <span
          className={`rounded-[1px] border border-white bg-[#C0392B] ${vertical ? "h-[60%] w-[55%]" : "h-[55%] w-[60%]"}`}
        />
      ) : (
        Array.from({ length: n }, (_, k) => (
          <span
            key={k}
            className="aspect-square h-[45%] max-h-[45%] rounded-[1px] border border-white bg-[#2E8B57]"
          />
        ))
      )}
    </span>
  );
}

function Tile({
  space,
  info,
  highlight,
  onTap,
}: {
  space: number;
  info: TileInfo;
  highlight: boolean;
  onTap: (space: number) => void;
}) {
  const seatColour = useSeatColour();
  const sp = SPACES[space] as Space;
  const { row, col, side } = cellOf(space);
  const Icon = ICON[sp.name];
  const vertical = side === "left" || side === "right";
  const owned = info.owner !== null;
  const label = `${describeSpace(sp)}${owned ? `, owned` : ""}${info.houses === 5 ? ", hotel" : info.houses ? `, ${info.houses} houses` : ""}${info.mortgaged ? ", mortgaged" : ""}`;

  return (
    <button
      type="button"
      onClick={() => onTap(space)}
      aria-label={label}
      style={{
        gridRow: row + 1,
        gridColumn: col + 1,
        background: side === "corner" ? CORNER : TILE,
        ...(info.mortgaged
          ? {
              backgroundImage:
                "linear-gradient(to top right, transparent calc(50% - 0.6px), rgba(26,28,32,.35) 50%, transparent calc(50% + 0.6px))",
            }
          : {}),
      }}
      className={`relative flex min-h-0 min-w-0 overflow-hidden border-[0.5px] border-ink/15 text-ink ${side === "corner" ? "flex-col items-center justify-center" : INNER[side]} ${highlight ? "z-10 outline-2 -outline-offset-2 outline-accent" : ""} ${info.mortgaged ? "opacity-60" : ""}`}
    >
      {sp.kind === "plot" ? (
        <>
          {/* Group colour band, with houses on it; the owner's colour just inside. */}
          <span
            className={`relative shrink-0 ${vertical ? "h-full w-[26%]" : "h-[26%] w-full"}`}
            style={{ background: GROUP_COLOUR[sp.group] }}
          >
            <Houses n={info.houses} vertical={vertical} />
          </span>
          {owned ? (
            <span
              className={`shrink-0 ${vertical ? "h-full w-[7%]" : "h-[7%] w-full"}`}
              style={{ background: seatColour(info.owner as number) }}
              aria-hidden="true"
            />
          ) : null}
          <span className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-[1cqw] px-px leading-none">
            <span className="hidden max-w-full truncate text-[1.45cqw] font-semibold @min-[480px]:block">
              {sp.name}
            </span>
            <span className="rounded-[2px] bg-ink/85 px-[max(3px,0.6cqw)] py-[0.15cqw] text-[max(6.5px,1.5cqw)] font-bold tracking-[0.06em] text-white">
              {sp.city}
            </span>
            <span className="text-[max(6.5px,1.45cqw)] font-semibold text-ink-2 tabular-nums">
              {naira(sp.price).replace("₦", "")}
            </span>
          </span>
        </>
      ) : (
        <span className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[0.6cqw] px-px leading-none">
          {Icon ? (
            <Icon
              aria-hidden="true"
              className={side === "corner" ? "size-[4.2cqw]" : "size-[2.8cqw]"}
              style={{ color: owned ? seatColour(info.owner as number) : undefined }}
            />
          ) : sp.kind === "tax" ? (
            <Landmark aria-hidden="true" className="size-[2.8cqw]" />
          ) : null}
          <span
            className={`max-w-full truncate font-semibold ${side === "corner" ? "text-[max(7px,1.6cqw)]" : "hidden text-[1.35cqw] @min-[480px]:block"}`}
          >
            {sp.name}
          </span>
          {sp.kind === "tax" ? (
            <span className="text-[max(6.5px,1.45cqw)] font-semibold text-ink-2">
              {naira(sp.amount).replace("₦", "")}
            </span>
          ) : null}
        </span>
      )}
    </button>
  );
}

type Props = {
  tiles: TileInfo[];
  /** Token square per seat (bankrupt players left out). */
  pos: Array<number | null>;
  /** The tile to ring (where the player on turn stands). */
  highlight: number | null;
  /** The seat whose token is lifted (moving now). */
  mover: number | null;
  onTile: (space: number) => void;
  /** The centre panel. */
  children: ReactNode;
};

/** The whole board, always on screen: 40 tiles round a centre panel framed in Ankara. */
export function PlotsBoard({ tiles, pos, highlight, mover, onTile, children }: Props) {
  // Group tokens by square so several fan out.
  const bySquare = new Map<number, number[]>();
  pos.forEach((sq, seat) => {
    if (sq === null) return;
    bySquare.set(sq, [...(bySquare.get(sq) ?? []), seat]);
  });
  return (
    <div className="@container relative aspect-square w-full select-none">
      <div
        className="grid size-full overflow-hidden rounded-card border border-ink/25 shadow-sm"
        style={{ gridTemplateColumns: TRACKS, gridTemplateRows: TRACKS }}
      >
        {SPACES.map((_, i) => (
          <Tile
            key={i}
            space={i}
            info={tiles[i] ?? { owner: null, houses: 0, mortgaged: false }}
            highlight={highlight === i}
            onTap={onTile}
          />
        ))}
        <div
          className="bg-ankara p-[2.6cqw]"
          style={{ gridRow: "2 / 11", gridColumn: "2 / 11", backgroundSize: "4cqw 4cqw" }}
        >
          <div className="flex size-full min-h-0 flex-col items-center justify-center gap-[1.6cqw] overflow-hidden rounded-[1.2cqw] bg-[#F7F1E3] p-[2.2cqw] text-center">
            {children}
          </div>
        </div>
      </div>
      {/* Tokens, on top of the tiles; they glide from square to square as they hop. */}
      {[...bySquare.entries()].flatMap(([sq, seats]) =>
        seats.map((seat, k) => {
          const at = tokenSpot(sq, k, seats.length);
          return (
            <span
              key={seat}
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-75 ease-out motion-reduce:transition-none"
              style={{
                left: `${at.x}%`,
                top: `${at.y}%`,
                width: "max(13px, 3.4cqw)",
                height: "max(13px, 3.4cqw)",
                filter: mover === seat ? "drop-shadow(0 2px 2px rgba(0,0,0,.35))" : undefined,
                scale: mover === seat ? "1.15" : undefined,
              }}
            >
              <Token seat={seat} />
            </span>
          );
        }),
      )}
    </div>
  );
}
