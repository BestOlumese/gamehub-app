"use client";

import {
  bailCount,
  GROUP_COLOUR,
  GROUP_SPACES,
  groupOf,
  naira,
  plotsOf,
  SPACES,
  type Bundle,
  type Offer,
  type PlotsAction,
  type PlotsView,
} from "@gamehub/engine/plots";
import type { SeatPublic } from "@gamehub/protocol";
import { Button } from "@gamehub/ui/forms/button";
import { Dialog } from "@gamehub/ui/overlays/dialog";
import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { seatName } from "../rps/names";
import { Token } from "./tokens";

const EMPTY: Bundle = { cash: 0, plots: [], bail: 0 };
const CASH_STEP = 10;

/** Plots that can be traded: no buildings anywhere in their group. */
const tradable = (view: PlotsView, seat: number) =>
  plotsOf(view, seat).filter((p) => {
    const g = groupOf(p);
    return !g || GROUP_SPACES[g].every((i) => !(view.houses[i] ?? 0));
  });

/** "Completes your Coral group" when receiving these plots would. */
function completes(view: PlotsView, seat: number, plots: number[]): string | null {
  for (const p of plots) {
    const g = groupOf(p);
    if (g && GROUP_SPACES[g].every((i) => view.owner[i] === seat || plots.includes(i)))
      return `${g.charAt(0).toUpperCase()}${g.slice(1)}`;
  }
  return null;
}

function Chip({
  space,
  on,
  onToggle,
  disabled,
}: {
  space: number;
  on: boolean;
  onToggle?: () => void;
  disabled?: boolean;
}) {
  const g = groupOf(space);
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onToggle}
      className={`flex w-full items-center gap-1.5 rounded-control border px-2 py-1.5 text-left text-xs font-semibold ${on ? "border-brand bg-brand-soft" : "border-line bg-surface"} disabled:opacity-100`}
    >
      <span
        className="h-3 w-1.5 shrink-0 rounded-full"
        style={{ background: g ? GROUP_COLOUR[g] : "#8A8E94" }}
      />
      <span className="truncate">{SPACES[space]?.name}</span>
    </button>
  );
}

function CashStepper({
  value,
  max,
  onChange,
  label,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-1 rounded-control border border-line px-1 py-1"
      aria-label={label}
    >
      <button
        type="button"
        aria-label={`Less (${label})`}
        className="rounded p-1 hover:bg-surface-2 disabled:opacity-30"
        disabled={value <= 0}
        onClick={() => onChange(Math.max(0, value - CASH_STEP))}
      >
        <Minus size={14} aria-hidden="true" />
      </button>
      <span className="text-sm font-bold tabular-nums">{naira(value)}</span>
      <button
        type="button"
        aria-label={`More (${label})`}
        className="rounded p-1 hover:bg-surface-2 disabled:opacity-30"
        disabled={value + CASH_STEP > max}
        onClick={() => onChange(Math.min(max, value + CASH_STEP))}
      >
        <Plus size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

function Side({
  title,
  view,
  seat,
  bundle,
  edit,
  onChange,
}: {
  title: string;
  view: PlotsView;
  seat: number;
  bundle: Bundle;
  edit: boolean;
  onChange: (b: Bundle) => void;
}) {
  const list = edit ? tradable(view, seat) : bundle.plots;
  const bails = bailCount(view, seat);
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="text-xs font-semibold tracking-wide text-ink-2 uppercase">{title}</p>
      {list.length ? (
        list.map((p) => (
          <Chip
            key={p}
            space={p}
            on={bundle.plots.includes(p)}
            disabled={!edit}
            onToggle={() =>
              onChange({
                ...bundle,
                plots: bundle.plots.includes(p)
                  ? bundle.plots.filter((x) => x !== p)
                  : [...bundle.plots, p],
              })
            }
          />
        ))
      ) : (
        <p className="text-xs text-ink-3">{edit ? "No plots to trade" : "No plots"}</p>
      )}
      {edit ? (
        <CashStepper
          label={`${title} cash`}
          value={bundle.cash}
          max={view.cash[seat] ?? 0}
          onChange={(cash) => onChange({ ...bundle, cash })}
        />
      ) : bundle.cash ? (
        <p className="text-sm font-bold">{naira(bundle.cash)}</p>
      ) : null}
      {edit && bails ? (
        <label className="flex items-center gap-2 text-xs font-semibold">
          <input
            type="checkbox"
            checked={bundle.bail > 0}
            onChange={(e) => onChange({ ...bundle, bail: e.target.checked ? 1 : 0 })}
          />
          Bail card
        </label>
      ) : !edit && bundle.bail ? (
        <p className="text-xs font-semibold">Bail card</p>
      ) : null}
    </div>
  );
}

type Props = {
  open: boolean;
  view: PlotsView;
  seats: SeatPublic[];
  me: number;
  ready: boolean;
  now: number;
  /** An offer made to you, to answer (else: make a new one). */
  incoming: Offer | null;
  act: (a: PlotsAction) => void;
  onClose: () => void;
};

/** Two columns, You give / You get (decided with Best, Oct 2026). */
export function TradeSheet({ open, view, seats, me, ready, now, incoming, act, onClose }: Props) {
  const [partner, setPartner] = useState<number | null>(null);
  const [give, setGive] = useState<Bundle>(EMPTY);
  const [get, setGet] = useState<Bundle>(EMPTY);
  const others = view.order.filter((x) => x !== me && !view.out.includes(x));

  function close() {
    setPartner(null);
    setGive(EMPTY);
    setGet(EMPTY);
    onClose();
  }

  if (incoming) {
    const left = Math.max(0, Math.ceil((incoming.expiresAt - now) / 1000));
    const hint = completes(view, me, incoming.give.plots);
    return (
      <Dialog
        open={open}
        onClose={close}
        title={`Offer from ${seatName(seats, incoming.from)}`}
        description={`${left} s to answer`}
      >
        <div className="grid grid-cols-2 gap-3">
          <Side
            title="You give"
            view={view}
            seat={me}
            bundle={incoming.get}
            edit={false}
            onChange={() => {}}
          />
          <Side
            title="You get"
            view={view}
            seat={incoming.from}
            bundle={incoming.give}
            edit={false}
            onChange={() => {}}
          />
        </div>
        {hint ? (
          <p className="mt-3 text-sm font-semibold text-brand-strong">
            Completes your {hint} group
          </p>
        ) : null}
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Button
            disabled={!ready}
            onClick={() => {
              act({ type: "accept_offer", id: incoming.id });
              close();
            }}
          >
            Accept
          </Button>
          <Button
            variant="secondary"
            disabled={!ready}
            onClick={() => {
              act({ type: "decline_offer", id: incoming.id });
              setPartner(incoming.from);
              setGive(incoming.get);
              setGet(incoming.give);
            }}
          >
            Counter
          </Button>
          <Button
            variant="secondary"
            disabled={!ready}
            onClick={() => {
              act({ type: "decline_offer", id: incoming.id });
              close();
            }}
          >
            Decline
          </Button>
        </div>
      </Dialog>
    );
  }

  if (partner === null)
    return (
      <Dialog open={open} onClose={close} title="Trade with…">
        <ul className="divide-y divide-line">
          {others.map((seat) => (
            <li key={seat}>
              <button
                type="button"
                onClick={() => setPartner(seat)}
                className="flex w-full items-center gap-3 py-2.5 text-left"
              >
                <span className="size-6 shrink-0">
                  <Token seat={seat} />
                </span>
                <span className="flex-1 truncate font-semibold">{seatName(seats, seat)}</span>
                <span className="text-sm text-ink-2 tabular-nums">
                  {naira(view.cash[seat] ?? 0)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>
    );

  const hint = completes(view, me, get.plots);
  const theirHint = completes(view, partner, give.plots);
  const empty =
    !give.cash && !give.plots.length && !give.bail && !get.cash && !get.plots.length && !get.bail;
  const pending = view.offers.some((o) => o.from === me && o.to === partner);
  return (
    <Dialog open={open} onClose={close} title={`Trade with ${seatName(seats, partner)}`}>
      <div className="grid grid-cols-2 gap-3">
        <Side title="You give" view={view} seat={me} bundle={give} edit onChange={setGive} />
        <Side title="You get" view={view} seat={partner} bundle={get} edit onChange={setGet} />
      </div>
      <p className="mt-3 min-h-5 text-sm font-semibold text-brand-strong">
        {hint
          ? `Completes your ${hint} group`
          : theirHint
            ? `Completes their ${theirHint} group`
            : ""}
      </p>
      <Button
        block
        className="mt-3"
        disabled={!ready || empty || pending}
        onClick={() => {
          act({ type: "offer", to: partner, give, get });
          close();
        }}
      >
        {pending ? "You already have an offer out to them" : "Send offer"}
      </Button>
      <p className="mt-2 text-center text-xs text-ink-3">They have 60 seconds to answer.</p>
    </Dialog>
  );
}
