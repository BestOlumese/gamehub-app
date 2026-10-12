"use client";

import { positionPenalty, type Card, type Position } from "@gamehub/engine/football";
import { Sprout } from "lucide-react";
import { flagOf, initials, roleName, statRows, tierColour } from "./look";

/**
 * Our player card (design system → Football Draft): a white rounded card, a thin tier-colour band
 * (Legends: Ankara), big OVR on the left, initials circle, short name, position chip, flag, club,
 * six stats in two rows of three. No photos, no shield, nothing like the FC cards.
 */
export function PlayerCard({
  card,
  slot,
  selected,
  onClick,
}: {
  card: Card;
  /** The slot being picked for: shows the out-of-position penalty if any. */
  slot?: Position;
  selected?: boolean;
  onClick?: () => void;
}) {
  const pen = slot ? positionPenalty(card, slot) : 0;
  const legend = card.group === "legend";
  const known = Object.entries(card.roles)
    .sort((a, b) => (a[1] === b[1] ? 0 : a[1] === "plusplus" ? -1 : 1))
    .slice(0, 2);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? !!selected : undefined}
      aria-label={`${card.name}, ${card.ovr}, ${card.positions.join(" ")}`}
      className={`flex w-full flex-col overflow-hidden rounded-card border bg-surface text-left shadow-sm transition-transform duration-(--dur-press) ${selected ? "border-brand ring-2 ring-brand" : "border-line"} ${onClick ? "active:scale-[0.98]" : ""}`}
    >
      <div
        className={`h-1.5 shrink-0 ${legend ? "bg-ankara" : ""}`}
        style={legend ? undefined : { background: tierColour(card.ovr) }}
        aria-hidden="true"
      />
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <div className="flex items-start gap-2">
          <span className="font-display text-3xl leading-none font-extrabold tabular-nums">
            {card.ovr}
          </span>
          <span className="ml-auto flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-ink-2">
            {initials(card.name)}
          </span>
        </div>
        <p className="truncate font-bold leading-tight">{card.short}</p>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="rounded-full bg-brand-soft px-1.5 py-0.5 font-bold text-brand-strong">
            {card.positions[0]}
          </span>
          {card.positions.slice(1).map((p) => (
            <span key={p} className="text-ink-2">
              {p}
            </span>
          ))}
          <span className="ml-auto" aria-label={card.nation}>
            {flagOf(card.nation)}
          </span>
        </div>
        <p className="truncate text-[11px] text-ink-2">
          {legend ? (card.era ?? "Legend") : (card.club ?? "No club listed")}
        </p>
        <dl className="grid grid-cols-3 gap-x-2 gap-y-0.5 text-[11px] tabular-nums">
          {statRows(card).map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <dt className="text-ink-3">{k}</dt>
              <dd className="font-bold">{v}</dd>
            </div>
          ))}
        </dl>
        {known.length ? (
          <p className="truncate text-[11px] text-ink-2">
            {known.map(([r, f]) => `${roleName(r)} ${f === "plusplus" ? "++" : "+"}`).join(" · ")}
          </p>
        ) : null}
        <div className="flex min-h-4 items-center gap-1 text-[11px] font-semibold">
          {card.group === "wonderkid" ? (
            <span className="flex items-center gap-0.5 text-brand-strong">
              <Sprout size={12} aria-hidden="true" /> Wonderkid
            </span>
          ) : null}
          {pen ? (
            <span className="ml-auto rounded bg-danger-soft px-1 text-danger-strong">−{pen}</span>
          ) : null}
        </div>
      </div>
    </Tag>
  );
}
