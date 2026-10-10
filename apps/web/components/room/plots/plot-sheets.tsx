"use client";

import {
  houseCost,
  CITY_NAME,
  GROUP_COLOUR,
  GROUP_SPACES,
  groupOf,
  mortgageValue,
  naira,
  plotRent,
  plotsOf,
  SPACES,
  transportRent,
  unmortgageCost,
  utilityRate,
  sellValue,
  type PlotsAction,
  type PlotsRules,
  type PlotsView,
} from "@gamehub/engine/plots";
import type { SeatPublic } from "@gamehub/protocol";
import { Button } from "@gamehub/ui/forms/button";
import { Dialog } from "@gamehub/ui/overlays/dialog";
import { seatName } from "../rps/names";
import { describeSpace } from "./board";
import { plotChoices } from "./centre-state";

type Act = (a: PlotsAction) => void;

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-1 ${strong ? "font-bold" : ""}`}>
      <span className="text-ink-2">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** A plot (or transport, utility) card: rents, owner, and what you can do with it. */
export function PlotCard({
  space,
  view,
  rules,
  seats,
  me,
  ready,
  act,
  onClose,
}: {
  space: number | null;
  view: PlotsView;
  rules: PlotsRules;
  seats: SeatPublic[];
  me: number | null;
  ready: boolean;
  act: Act;
  onClose: () => void;
}) {
  const sp = space === null ? null : SPACES[space];
  if (space === null || !sp)
    return (
      <Dialog open={false} onClose={onClose} title="">
        {null}
      </Dialog>
    );
  const owner = view.owner[space] ?? null;
  const h = view.houses[space] ?? 0;
  const mine = owner === me && me !== null;
  const g = groupOf(space);
  // The same checks the game makes (any time, except during an auction or someone's payment).
  const reasons = plotChoices(view, rules, me, space);
  const ownable = sp.kind === "plot" || sp.kind === "transport" || sp.kind === "utility";

  return (
    <Dialog
      open
      onClose={onClose}
      title={sp.name}
      description={sp.kind === "plot" ? CITY_NAME[sp.city] : undefined}
    >
      {sp.kind === "plot" ? (
        <div className="mb-3 h-2 rounded-full" style={{ background: GROUP_COLOUR[sp.group] }} />
      ) : null}
      {sp.kind === "plot" ? (
        <div className="text-sm">
          <Row label="Rent" value={naira(plotRent(space, 0))} strong={!h} />
          <Row
            label="With the whole group"
            value={naira(plotRent(space, 0) * rules.groupRentMultiplier)}
          />
          {[1, 2, 3, 4].map((n) => (
            <Row
              key={n}
              label={`With ${n} house${n > 1 ? "s" : ""}`}
              value={naira(plotRent(space, n))}
              strong={h === n}
            />
          ))}
          <Row label="With a hotel" value={naira(plotRent(space, 5))} strong={h === 5} />
          <div className="my-2 h-px bg-line" />
          <Row label="Price" value={naira(sp.price)} />
          {[1, 2, 3, 4, 5].map((level) => (
            <Row
              key={`c${level}`}
              label={level === 5 ? "Building the hotel" : `Building house ${level}`}
              value={naira(houseCost(space, level))}
              strong={h + 1 === level}
            />
          ))}
          <Row label="Mortgage value" value={naira(mortgageValue(space))} />
        </div>
      ) : sp.kind === "transport" ? (
        <div className="text-sm">
          {[1, 2, 3, 4].map((n) => (
            <Row key={n} label={`Owner has ${n}`} value={naira(transportRent(n))} />
          ))}
          <div className="my-2 h-px bg-line" />
          <Row label="Price" value={naira(sp.price)} />
          <Row label="Mortgage value" value={naira(mortgageValue(space))} />
        </div>
      ) : sp.kind === "utility" ? (
        <div className="text-sm">
          <Row label="Owner has one" value={`${naira(utilityRate(1))} × dice`} />
          <Row label="Owner has both" value={`${naira(utilityRate(2))} × dice`} />
          <div className="my-2 h-px bg-line" />
          <Row label="Price" value={naira(sp.price)} />
          <Row label="Mortgage value" value={naira(mortgageValue(space))} />
        </div>
      ) : (
        <p className="text-ink-2">{describeSpace(sp)}</p>
      )}

      {ownable ? (
        <p className="mt-3 text-sm font-semibold">
          {owner === null
            ? "Nobody owns it yet."
            : `${mine ? "Yours" : `Owned by ${seatName(seats, owner)}`}${view.mortgaged[space] ? " · mortgaged" : ""}${h === 5 ? " · hotel" : h ? ` · ${h} house${h > 1 ? "s" : ""}` : ""}`}
        </p>
      ) : null}

      {sp.kind === "plot" ? (
        <p className="mt-1 text-xs text-ink-2">
          Bank has {view.bank.houses} house{view.bank.houses === 1 ? "" : "s"} and{" "}
          {view.bank.hotels} hotel{view.bank.hotels === 1 ? "" : "s"} left
        </p>
      ) : null}
      {mine ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {g ? (
            <Button
              variant="secondary"
              disabled={!ready || !!reasons.build}
              onClick={() => act({ type: "build", space })}
            >
              {h === 4 ? "Build hotel" : "Build"} {naira(houseCost(space, h + 1))}
            </Button>
          ) : null}
          {g ? (
            <Button
              variant="secondary"
              disabled={!ready || !!reasons.sell}
              onClick={() => act({ type: "sell_building", space })}
            >
              Sell building +{naira(sellValue(space, h))}
            </Button>
          ) : null}
          {view.mortgaged[space] ? (
            <Button
              variant="secondary"
              disabled={!ready || !!reasons.unmortgage}
              onClick={() => act({ type: "unmortgage", space })}
            >
              Unmortgage {naira(unmortgageCost(space, rules))}
            </Button>
          ) : (
            <Button
              variant="secondary"
              disabled={!ready || !!reasons.mortgage}
              onClick={() => act({ type: "mortgage", space })}
            >
              Mortgage +{naira(mortgageValue(space))}
            </Button>
          )}
          <p className="col-span-2 text-xs text-ink-2">
            {[
              reasons.build && g ? `Build: ${reasons.build}` : null,
              view.mortgaged[space]
                ? reasons.unmortgage
                  ? `Unmortgage: ${reasons.unmortgage}`
                  : null
                : reasons.mortgage
                  ? `Mortgage: ${reasons.mortgage}`
                  : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      ) : null}
    </Dialog>
  );
}

/** Your plots by group, with the same actions, plus your cash and Bail cards. */
export function MyPlots({
  open,
  view,
  rules,
  me,
  ready,
  act,
  onPick,
  onClose,
}: {
  open: boolean;
  view: PlotsView;
  rules: PlotsRules;
  me: number;
  ready: boolean;
  act: Act;
  onPick: (space: number) => void;
  onClose: () => void;
}) {
  const mine = plotsOf(view, me);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="My plots"
      description={`Cash ${naira(view.cash[me] ?? 0)}${view.bail.gist === me || view.bail.hustle === me ? " · Bail card" : ""} · bank: ${view.bank.houses} houses, ${view.bank.hotels} hotels`}
    >
      {mine.length ? (
        <ul className="divide-y divide-line">
          {mine.map((p) => {
            const sp = SPACES[p];
            const g = groupOf(p);
            const full = g ? GROUP_SPACES[g].every((i) => view.owner[i] === me) : false;
            const h = view.houses[p] ?? 0;
            const canBuild = g !== null && plotChoices(view, rules, me, p).build === null;
            return (
              <li key={p} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onPick(p)}
                  className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left"
                >
                  <span
                    className="h-8 w-1.5 shrink-0 rounded-full"
                    style={{ background: g ? GROUP_COLOUR[g] : "#8A8E94" }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{sp?.name}</span>
                    <span className="block text-xs text-ink-2">
                      {[
                        full ? "Whole group" : null,
                        h === 5 ? "Hotel" : h ? `${h} house${h > 1 ? "s" : ""}` : null,
                        view.mortgaged[p] ? "Mortgaged" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Unbuilt"}
                    </span>
                  </span>
                </button>
                {canBuild && g ? (
                  <Button
                    size="md"
                    variant="secondary"
                    disabled={!ready}
                    onClick={() => act({ type: "build", space: p })}
                  >
                    {h === 4 ? "Hotel" : "Build"} {naira(houseCost(p, h + 1))}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-ink-2">You don&apos;t own any plots yet.</p>
      )}
    </Dialog>
  );
}
