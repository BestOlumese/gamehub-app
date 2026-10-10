"use client";

import {
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
import { centreState, type CentreState } from "./centre-state";
import { useSeatColour } from "./tokens";

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
  cs,
  ready,
  offset,
  act,
}: {
  view: PlotsView;
  rules: PlotsRules;
  seats: SeatPublic[];
  me: number | null;
  cs: Extract<CentreState, { kind: "auction" }>;
  ready: boolean;
  offset: number;
  act: Act;
}) {
  const [custom, setCustom] = useState("");
  const a = view.auction;
  if (!a) return null;
  const sp = SPACES[a.space];
  const cash = me === null ? 0 : (view.cash[me] ?? 0);
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
      {cs.bidding ? (
        <>
          <div className="grid w-full grid-cols-4 gap-1">
            {[rules.minBidIncrement, 50, 100].map((step, k) => {
              const q = cs.quick.find(
                (x) => x.step === step || (k === 0 && x.step === rules.minBidIncrement),
              );
              const amount = a.by === null ? Math.max(rules.minBidIncrement, step) : a.high + step;
              return (
                <Button
                  key={step}
                  size="md"
                  variant="secondary"
                  className="px-1"
                  disabled={!ready || !q}
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
              if (k >= cs.min && k <= cash) {
                bid(k);
                setCustom("");
              }
            }}
          >
            <input
              inputMode="numeric"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))}
              placeholder={`Your bid in ₦k, from ${cs.min}`}
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

const small = "text-[max(11px,1.9cqw)]";

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
  const seatColour = useSeatColour();
  const [confirmBankrupt, setConfirmBankrupt] = useState(false);
  const turnSeat = view.order[view.turn] as number;
  const shownDice = dice?.dice ?? view.dice;
  const go = ready && !playing;
  const left = view.endsAt === null ? null : Math.max(0, view.endsAt - now);
  const cs = centreState(view, rules, me);

  let body: ReactNode = null;
  switch (cs.kind) {
    case "auction":
      body = (
        <AuctionPanel
          view={view}
          rules={rules}
          seats={seats}
          me={me}
          cs={cs}
          ready={ready}
          offset={offset}
          act={act}
        />
      );
      break;
    case "owe": {
      const enough = cs.cash + cs.raisable >= cs.amount;
      body = (
        <div className="flex w-full flex-col items-center gap-1.5">
          <p className="text-[max(13px,2.5cqw)] font-bold">
            You owe {naira(cs.amount)}{" "}
            {cs.to === "bank" ? "to the bank" : `to ${seatName(seats, cs.to)}`}
          </p>
          <p className={`${small} text-ink-2`}>
            {enough
              ? `You have ${naira(cs.cash)}. Sell or mortgage to pay (you can raise ${naira(cs.raisable)}).`
              : `You have ${naira(cs.cash)} and can raise only ${naira(cs.raisable)} more.`}
          </p>
          {confirmBankrupt ? (
            <div className="grid w-full grid-cols-2 gap-1.5">
              <Button
                size="md"
                disabled={!ready}
                onClick={() => {
                  setConfirmBankrupt(false);
                  act({ type: "declare_bankruptcy" });
                }}
              >
                Yes, I&apos;m out
              </Button>
              <Button size="md" variant="secondary" onClick={() => setConfirmBankrupt(false)}>
                Keep playing
              </Button>
            </div>
          ) : (
            <>
              {enough ? (
                <Button block disabled={!ready} onClick={() => act({ type: "auto_pay" })}>
                  Raise it for me
                </Button>
              ) : null}
              <div className="grid w-full grid-cols-2 gap-1.5">
                <Button size="md" variant="secondary" disabled={!ready} onClick={onMyPlots}>
                  Choose myself
                </Button>
                <Button
                  size="md"
                  variant="ghost"
                  disabled={!ready}
                  onClick={() => setConfirmBankrupt(true)}
                >
                  Go bankrupt
                </Button>
              </div>
            </>
          )}
        </div>
      );
      break;
    }
    case "raising":
      body = (
        <p className="text-[max(12px,2.2cqw)] font-semibold">
          {seatName(seats, cs.seat)} is raising {naira(cs.amount)}…
        </p>
      );
      break;
    case "roll":
      body = playing ? null : (
        <div className="flex w-full flex-col items-center gap-1.5">
          {cs.detained ? (
            <p className={`${small} font-semibold`}>
              At the Police Post: roll doubles, pay, or use a Bail card
            </p>
          ) : null}
          <Button block disabled={!go} onClick={() => act({ type: "roll" })}>
            {cs.detained ? "Roll for doubles" : cs.again ? "Roll again" : "Roll"}
          </Button>
          {cs.detained ? (
            <div className="grid w-full grid-cols-2 gap-1.5">
              <Button
                size="md"
                variant="secondary"
                disabled={!go || !cs.canPay}
                onClick={() => act({ type: "pay_fine" })}
              >
                Pay {naira(rules.policeFine)}
              </Button>
              <Button
                size="md"
                variant="secondary"
                disabled={!go || !cs.canBail}
                onClick={() => act({ type: "use_bail" })}
              >
                Use Bail card
              </Button>
            </div>
          ) : null}
        </div>
      );
      break;
    case "buy":
      body = playing ? null : (
        <div className="flex w-full flex-col items-center gap-1.5">
          <p className="flex items-center gap-1.5 text-[max(13px,2.6cqw)] font-bold">
            <Swatch space={cs.space} /> {SPACES[cs.space]?.name}
          </p>
          <div className="grid w-full grid-cols-2 gap-1.5">
            <Button disabled={!go || !cs.canBuy} onClick={() => act({ type: "buy" })}>
              Buy {naira(cs.price)}
            </Button>
            <Button variant="secondary" disabled={!go} onClick={() => act({ type: "decline" })}>
              {rules.auctions ? "Auction" : "Don't buy"}
            </Button>
          </div>
          {!cs.canBuy ? (
            <button
              type="button"
              onClick={onMyPlots}
              className={`${small} font-semibold text-brand-strong underline`}
            >
              Short of cash? Mortgage or sell in My plots
            </button>
          ) : null}
        </div>
      );
      break;
    case "manage":
      body = playing ? null : (
        <Button block disabled={!go} onClick={() => act({ type: "end_turn" })}>
          End turn
        </Button>
      );
      break;
    case "turn":
      body = (
        <p className="flex items-center gap-1.5 text-[max(12px,2.2cqw)] font-semibold">
          <span
            className="size-2.5 rounded-full"
            style={{ background: seatColour(cs.seat) }}
            aria-hidden="true"
          />
          {seatName(seats, cs.seat)}&apos;s turn
        </p>
      );
      break;
    default:
      body = null;
  }

  return (
    <>
      <p className="text-[max(10px,1.7cqw)] font-bold tracking-wide text-ink-2 uppercase">
        Naija Plots
        {left !== null ? (
          <span className={`ml-2 tabular-nums ${view.lastRound ? "text-danger-strong" : ""}`}>
            {view.lastRound ? "Last round!" : left > 0 ? `${mmss(left)} left` : "Time's up"}
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
              colour={seatColour(dice?.seat ?? turnSeat)}
              canRoll={false}
              onRoll={() => {}}
            />
          ))}
        </div>
      ) : null}
      {card && !view.auction ? (
        <p
          className={`w-full rounded-control border border-line bg-surface px-2 py-1.5 ${small} leading-snug`}
        >
          <span className="font-bold">{card.deck === "gist" ? "Gist" : "Hustle"}:</span> {card.text}
        </p>
      ) : null}
      {body}
      <p
        className={`h-[1.3em] max-w-full truncate ${small} font-semibold text-ink-2`}
        aria-live="polite"
      >
        {view.auction ? "" : (line ?? "")}
      </p>
    </>
  );
}
