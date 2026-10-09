"use client";

import {
  activeSeats,
  naira,
  type Offer,
  type PlotsAction,
  type PlotsRules,
  type PlotsView,
} from "@gamehub/engine/plots";
import type { ClientRoomMsg } from "@gamehub/protocol";
import { Button } from "@gamehub/ui/forms/button";
import { ArrowLeftRight, MapPinned } from "lucide-react";
import { useState } from "react";
import { useRoom, type Snapshot } from "@/lib/room/store";
import { ToolButton } from "../board-games/tool-button";
import { seatName } from "../rps/names";
import { useNow } from "../use-now";
import { PlotsBoard, type TileInfo } from "./board";
import { Centre } from "./centre";
import { MyPlots, PlotCard } from "./plot-sheets";
import { PlayerSheet, PlayersStrip } from "./players";
import { PlotsResult } from "./result-sheet";
import { TradeSheet } from "./trade-sheet";
import { usePlotsFeed } from "./use-plots-feed";

type Props = { snap: Snapshot; send: (m: ClientRoomMsg) => void };

const full = (o: PlotsView["offers"][number]): o is Offer => !("hidden" in o);

/** Players above, the whole board with its centre panel, then offers and your tools. */
export default function PlotsTable({ snap, send }: Props) {
  const offset = useRoom((s) => s.offset);
  const pending = useRoom((s) => s.pending);
  const connection = useRoom((s) => s.connection);
  const view = snap.view as PlotsView;
  const rules = snap.room.rules as PlotsRules;
  const me = snap.you === "spectator" ? null : snap.you;
  const ended = snap.room.phase === "ended" || !!view.places;
  const feed = usePlotsFeed(snap.seats, me);
  const now = useNow(!ended, 1000) + offset;
  const [plot, setPlot] = useState<number | null>(null);
  const [mine, setMine] = useState(false);
  const [trade, setTrade] = useState<{ incoming: number | null } | null>(null);
  const [player, setPlayer] = useState<number | null>(null);

  const ready = connection === "open" && pending === null;
  const turnSeat = view.order[view.turn] as number;
  const waiting = view.auction
    ? activeSeats(view).filter((x) => !view.auction?.out.includes(x) && x !== view.auction?.by)
    : view.debts[0]
      ? [view.debts[0].from]
      : [turnSeat];

  function act(action: PlotsAction) {
    const id = crypto.randomUUID();
    useRoom.setState({ pending: { id, action } });
    send({ t: "act", id, v: snap.v, a: action });
  }

  const shownPos = feed.pos ?? view.pos;
  const pos = shownPos.map((sq, seat) => (view.out.includes(seat) ? null : sq));
  const tiles: TileInfo[] = view.owner.map((owner, i) => ({
    owner,
    houses: view.houses[i] ?? 0,
    mortgaged: !!view.mortgaged[i],
  }));

  const offers = view.offers.filter(full).filter((o) => o.expiresAt > now);
  const incoming = offers.find((o) => o.to === me) ?? null;
  const outgoing = offers.find((o) => o.from === me) ?? null;
  const negotiating = view.offers.filter((o) => "hidden" in o && o.expiresAt > now);
  const trading =
    me !== null &&
    rules.trading &&
    !ended &&
    !view.out.includes(me) &&
    activeSeats(view).length > 1;
  const answering =
    trade?.incoming !== null && trade?.incoming !== undefined
      ? (offers.find((o) => o.id === trade.incoming) ?? null)
      : null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-2 px-3 py-3 lg:max-w-2xl">
      <PlayersStrip
        view={view}
        seats={snap.seats}
        me={me}
        waiting={feed.playing ? [] : waiting}
        deadlines={snap.deadlines.turns}
        turnMs={view.auction ? rules.auctionSecondsPerBid * 1000 : rules.turnSeconds * 1000 + 3000}
        offset={offset}
        onPick={setPlayer}
      />

      {/* Capped by screen height so the toolbar stays on a 360 × 640 phone. */}
      <div className="mx-auto w-full" style={{ maxWidth: "max(16rem, calc(100dvh - 14rem))" }}>
        <PlotsBoard
          tiles={tiles}
          pos={pos}
          highlight={feed.playing || ended ? null : (view.pos[turnSeat] ?? null)}
          mover={feed.playing ? (feed.dice?.seat ?? null) : null}
          onTile={setPlot}
        >
          <Centre
            view={view}
            rules={rules}
            seats={snap.seats}
            me={me}
            ready={ready}
            playing={feed.playing}
            dice={feed.dice}
            card={feed.card}
            line={feed.line}
            now={now}
            offset={offset}
            act={act}
            onMyPlots={() => setMine(true)}
          />
        </PlotsBoard>
      </div>

      {/* Offers: yours to answer, yours waiting, and others negotiating (contents private). */}
      {incoming && me !== null ? (
        <div className="flex items-center gap-2 rounded-control bg-accent-soft px-3 py-2 text-sm font-semibold">
          <span className="flex-1 truncate">
            {seatName(snap.seats, incoming.from)} sent you an offer
          </span>
          <Button size="md" onClick={() => setTrade({ incoming: incoming.id })}>
            View
          </Button>
        </div>
      ) : outgoing ? (
        <div className="flex items-center gap-2 rounded-control bg-surface-2 px-3 py-2 text-sm font-semibold">
          <span className="flex-1 truncate">
            Waiting for {seatName(snap.seats, outgoing.to)} (
            {Math.max(0, Math.ceil((outgoing.expiresAt - now) / 1000))} s)
          </span>
          <Button
            size="md"
            variant="secondary"
            disabled={!ready}
            onClick={() => act({ type: "cancel_offer", id: outgoing.id })}
          >
            Cancel
          </Button>
        </div>
      ) : negotiating[0] ? (
        <p className="truncate text-center text-xs text-ink-2">
          {seatName(snap.seats, negotiating[0].from)} and {seatName(snap.seats, negotiating[0].to)}{" "}
          are negotiating
        </p>
      ) : null}

      {me !== null && !ended && !view.out.includes(me) ? (
        <div className="grid grid-cols-2 gap-1.5" role="toolbar" aria-label="Game actions">
          <ToolButton
            icon={<MapPinned size={18} />}
            label={`My plots · ${naira(view.cash[me] ?? 0)}`}
            onClick={() => setMine(true)}
          />
          <ToolButton
            icon={<ArrowLeftRight size={18} />}
            label="Trade"
            onClick={() => setTrade({ incoming: null })}
            disabled={!trading || !!view.auction || view.debts.length > 0}
          />
        </div>
      ) : me === null ? (
        <p className="text-center text-sm text-ink-2">You&apos;re watching.</p>
      ) : null}

      <PlotCard
        space={plot}
        view={view}
        rules={rules}
        seats={snap.seats}
        me={me}
        ready={ready}
        act={act}
        onClose={() => setPlot(null)}
      />
      {me !== null ? (
        <MyPlots
          open={mine}
          view={view}
          rules={rules}
          me={me}
          onPick={(p) => {
            setMine(false);
            setPlot(p);
          }}
          onClose={() => setMine(false)}
        />
      ) : null}
      {me !== null && trade ? (
        <TradeSheet
          open
          view={view}
          seats={snap.seats}
          me={me}
          ready={ready}
          now={now}
          incoming={answering}
          act={act}
          onClose={() => setTrade(null)}
        />
      ) : null}
      <PlayerSheet
        seat={player}
        view={view}
        rules={rules}
        seats={snap.seats}
        onPlot={(p) => {
          setPlayer(null);
          setPlot(p);
        }}
        onClose={() => setPlayer(null)}
      />

      {ended && view.places ? (
        <PlotsResult
          view={view}
          rules={rules}
          seats={snap.seats}
          me={me}
          onRematch={() => send({ t: "rematch" })}
        />
      ) : null}
    </div>
  );
}
