"use client";

import {
  bailCount,
  GROUP_COLOUR,
  naira,
  priceOf,
  SPACES,
  type PlotsAction,
  type PlotsRules,
  type PlotsView,
} from "@gamehub/engine/plots";
import type { SeatPublic } from "@gamehub/protocol";
import { Button } from "@gamehub/ui/forms/button";
import { useState, type ReactNode } from "react";
import { Die } from "../die";
import { seatName } from "../rps/names";
import { mmss } from "../use-now";
import { TimerRing } from "../timer-ring";
import { tokenColour } from "./tokens";

type Act = (a: PlotsAction) => void;

function Swatch({ space }: { space: number }) {
  const sp = SPACES[space];
  return (
    <span
      className="inline-block h-[0.8em] w-[0.8em] shrink-0 rounded-[2px]"
      style={{ background: sp?.kind === "plot" ? GROUP_COLOUR[sp.group] : "#8A8E94" }}
      aria-hidden="true"
    />
  );
}

/** The auction in the board's centre: high bid, countdown ring, quick bids, Pass. */
function AuctionPanel({
  view,
  rules,
  seats,
  me,
  ready,
  offset,
  act,
}: {
  view: PlotsView;
  rules: PlotsRules;
  seats: SeatPublic[];
  me: number | null;
  ready: boolean;
  offset: number;
  act: Act;
}) {
  const [custom, setCustom] = useState("");
  const a = view.auction;
  if (!a) return null;
  const sp = SPACES[a.space];
  const inc = rules.minBidIncrement;
  const min = a.by === null ? inc : a.high + inc;
  const cash = me === null ? 0 : (view.cash[me] ?? 0);
  const inIt = me !== null && !view.out.includes(me) && !a.out.includes(me) && a.by !== me;
  const bid = (amount: number) => act({ type: "bid", amount });
  // Small boards (phones) get the essentials: name and price, the ring, quick bids and Pass;
  // a custom amount from 420 px up.
  return (
    <div className="flex w-full flex-col items-center gap-[1.2cqw]">
      <p className="flex items-center gap-1.5 text-[max(12px,2.6cqw)] font-bold">
        <Swatch space={a.space} /> Auction: {sp?.name}
      </p>
      <p className="text-[max(10px,1.8cqw)] text-ink-2">Price {naira(priceOf(a.space))}</p>
      <div className="relative flex items-center justify-center" style={{ width: 46, height: 46 }}>
        <TimerRing
          key={a.endsAt}
          endsAt={a.endsAt}
          totalMs={rules.auctionSecondsPerBid * 1000}
          offset={offset}
          size={46}
        />
        <span className="text-[11px] font-bold tabular-nums">
          {a.by === null ? "–" : naira(a.high)}
        </span>
      </div>
      <p className="text-[max(10px,1.8cqw)] font-semibold">
        {a.by === null
          ? "No bids yet"
          : a.by === me
            ? "You're the highest bidder"
            : `${seatName(seats, a.by)} leads`}
      </p>
      {inIt ? (
        <>
          <div className="grid w-full grid-cols-4 gap-1">
            {[inc, 50, 100].map((step) => {
              const amount = a.by === null ? Math.max(inc, step) : a.high + step;
              return (
                <Button
                  key={step}
                  size="md"
                  variant="secondary"
                  className="px-1"
                  disabled={!ready || amount > cash}
                  onClick={() => bid(amount)}
                >
                  {a.by === null ? naira(amount) : `+${naira(step).replace("₦", "")}`}
                </Button>
              );
            })}
            <Button
              size="md"
              variant="ghost"
              className="px-1"
              disabled={!ready}
              onClick={() => act({ type: "pass_bid" })}
            >
              Pass
            </Button>
          </div>
          <form
            className="hidden w-full gap-1 @min-[420px]:flex"
            onSubmit={(e) => {
              e.preventDefault();
              const k = Math.round(Number(custom));
              if (k >= min && k <= cash) {
                bid(k);
                setCustom("");
              }
            }}
          >
            <input
              inputMode="numeric"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))}
              placeholder={`Your bid in ₦k, from ${min}`}
              aria-label="Your bid in thousands of naira"
              className="h-10 min-w-0 flex-1 rounded-control border border-line bg-surface px-2 text-sm"
            />
            <Button size="md" variant="secondary" type="submit" disabled={!ready}>
              Bid
            </Button>
          </form>
        </>
      ) : me !== null && a.out.includes(me) ? (
        <p className="text-[max(10px,1.8cqw)] text-ink-2">You passed</p>
      ) : null}
    </div>
  );
}

type Props = {
  view: PlotsView;
  rules: PlotsRules;
  seats: SeatPublic[];
  me: number | null;
  ready: boolean;
  /** Playback is running: hold the buttons until the move is shown. */
  playing: boolean;
  dice: { dice: [number, number]; key: number; seat: number } | null;
  card: { deck: string; text: string; seat: number } | null;
  line: string | null;
  now: number;
  offset: number;
  act: Act;
  onMyPlots: () => void;
};

/** The middle of the board: clock, dice, what you can do now, the latest news. */
export function Centre({
  view,
  rules,
  seats,
  me,
  ready,
  playing,
  dice,
  card,
  line,
  now,
  offset,
  act,
  onMyPlots,
}: Props) {
  const turnSeat = view.order[view.turn] as number;
  const myTurn = me !== null && turnSeat === me && !view.places;
  const shownDice = dice?.dice ?? view.dice;
  const go = ready && !playing;
  const left = view.endsAt === null ? null : Math.max(0, view.endsAt - now);
  const debt = view.debts[0];

  let body: ReactNode = null;
  if (view.auction) {
    body = (
      <AuctionPanel
        view={view}
        rules={rules}
        seats={seats}
        me={me}
        ready={ready}
        offset={offset}
        act={act}
      />
    );
  } else if (debt) {
    body =
      debt.from === me ? (
        <div className="flex w-full flex-col items-center gap-2">
          <p className="text-[max(13px,2.5cqw)] font-bold">
            You owe {naira(debt.amount)}{" "}
            {debt.to === "bank" ? "to the bank" : `to ${seatName(seats, debt.to)}`}
          </p>
          <p className="text-[max(11px,1.9cqw)] text-ink-2">
            Sell buildings or mortgage plots to pay. You have {naira(view.cash[me] ?? 0)}.
          </p>
          <div className="grid w-full grid-cols-2 gap-1.5">
            <Button size="md" disabled={!ready} onClick={onMyPlots}>
              My plots
            </Button>
            <Button
              size="md"
              variant="secondary"
              disabled={!ready}
              onClick={() => act({ type: "declare_bankruptcy" })}
            >
              Go bankrupt
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-[max(12px,2.2cqw)] font-semibold">
          {seatName(seats, debt.from)} is raising {naira(debt.amount)}…
        </p>
      );
  } else if (myTurn && !playing) {
    const detained = view.detained[me] !== null && view.detained[me] !== undefined;
    if (view.step === "roll")
      body = (
        <div className="flex w-full flex-col items-center gap-1.5">
          {detained ? (
            <p className="text-[max(11px,1.9cqw)] font-semibold">
              At the Police Post: roll doubles, pay, or use a Bail card
            </p>
          ) : null}
          <Button block disabled={!go} onClick={() => act({ type: "roll" })}>
            {detained ? "Roll for doubles" : view.again ? "Roll again" : "Roll"}
          </Button>
          {detained ? (
            <div className="grid w-full grid-cols-2 gap-1.5">
              <Button
                size="md"
                variant="secondary"
                disabled={!go || (view.cash[me] ?? 0) < rules.policeFine}
                onClick={() => act({ type: "pay_fine" })}
              >
                Pay {naira(rules.policeFine)}
              </Button>
              <Button
                size="md"
                variant="secondary"
                disabled={!go || !bailCount(view, me)}
                onClick={() => act({ type: "use_bail" })}
              >
                Use Bail card
              </Button>
            </div>
          ) : null}
        </div>
      );
    else if (view.step === "buy") {
      const space = view.pos[me] ?? 0;
      const price = priceOf(space);
      body = (
        <div className="flex w-full flex-col items-center gap-1.5">
          <p className="flex items-center gap-1.5 text-[max(13px,2.6cqw)] font-bold">
            <Swatch space={space} /> {SPACES[space]?.name}
          </p>
          <div className="grid w-full grid-cols-2 gap-1.5">
            <Button
              disabled={!go || (view.cash[me] ?? 0) < price}
              onClick={() => act({ type: "buy" })}
            >
              Buy {naira(price)}
            </Button>
            <Button variant="secondary" disabled={!go} onClick={() => act({ type: "decline" })}>
              {rules.auctions ? "Auction" : "Don't buy"}
            </Button>
          </div>
        </div>
      );
    } else
      body = (
        <Button block disabled={!go} onClick={() => act({ type: "end_turn" })}>
          End turn
        </Button>
      );
  } else if (!view.places) {
    body = (
      <p className="flex items-center gap-1.5 text-[max(12px,2.2cqw)] font-semibold">
        <span
          className="size-2.5 rounded-full"
          style={{ background: tokenColour(turnSeat) }}
          aria-hidden="true"
        />
        {seatName(seats, turnSeat)}&apos;s turn
      </p>
    );
  }

  return (
    <>
      <p className="text-[max(10px,1.7cqw)] font-bold tracking-wide text-ink-2 uppercase">
        Naija Plots
        {left !== null ? (
          <span className={`ml-2 tabular-nums ${view.lastRound ? "text-danger-strong" : ""}`}>
            {view.lastRound ? "Last round!" : `${mmss(left)} left`}
          </span>
        ) : rules.mode === "timed" ? (
          <span className="ml-2">{rules.timedMinutes} min</span>
        ) : null}
      </p>
      {!view.auction ? (
        <div
          className="flex gap-2"
          aria-live="polite"
          aria-label={shownDice ? `Dice: ${shownDice[0]} and ${shownDice[1]}` : "Dice"}
        >
          {[0, 1].map((k) => (
            <Die
              key={k}
              value={shownDice?.[k] ?? null}
              rollKey={dice?.key ?? 0}
              colour={tokenColour(dice?.seat ?? turnSeat)}
              canRoll={false}
              onRoll={() => {}}
            />
          ))}
        </div>
      ) : null}
      {card && !view.auction ? (
        <p className="w-full rounded-control border border-line bg-surface px-2 py-1.5 text-[max(11px,1.9cqw)] leading-snug">
          <span className="font-bold">{card.deck === "gist" ? "Gist" : "Hustle"}:</span> {card.text}
        </p>
      ) : null}
      {body}
      <p
        className="h-[1.3em] max-w-full truncate text-[max(11px,1.9cqw)] font-semibold text-ink-2"
        aria-live="polite"
      >
        {view.auction ? "" : (line ?? "")}
      </p>
    </>
  );
}
