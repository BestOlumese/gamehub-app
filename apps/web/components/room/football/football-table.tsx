"use client";

import {
  footballNaija,
  type FootballAction,
  type FootballRules,
  type FootballView,
  type TeamSheet,
} from "@gamehub/engine/football";
import type { ClientRoomMsg } from "@gamehub/protocol";
import { Button } from "@gamehub/ui/forms/button";
import { useState } from "react";
import { useRoom, type Snapshot } from "@/lib/room/store";
import { seatName } from "../rps/names";
import { mmss, useNow } from "../use-now";
import { DraftView } from "./draft-view";
import { ManageSheet } from "./manage-sheet";
import { MatchView } from "./match-view";
import { ResultsView, teamName } from "./results-view";
import { TeamEditor } from "./team-editor";

type Props = { snap: Snapshot; send: (m: ClientRoomMsg) => void };

/** Football Draft: the draft, arranging, live matches and breaks, then results. */
export default function FootballTable({ snap, send }: Props) {
  const offset = useRoom((s) => s.offset);
  const pending = useRoom((s) => s.pending);
  const connection = useRoom((s) => s.connection);
  const view = snap.view as FootballView;
  const rules = { ...footballNaija, ...(snap.room.rules as Partial<FootballRules>) };
  const me = view.me;
  const you = view.you;
  const ready = connection === "open" && pending === null;
  const now = useNow(view.phase !== "over", 1000) + offset;
  const [manage, setManage] = useState(false);

  function act(action: FootballAction) {
    const id = crypto.randomUUID();
    useRoom.setState({ pending: { id, action } });
    send({ t: "act", id, v: snap.v, a: action });
  }

  const wrap = (children: React.ReactNode) => (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3 px-3 py-3">{children}</div>
  );

  if (view.phase === "over")
    return wrap(
      <ResultsView
        view={view}
        seats={snap.seats}
        me={you}
        onRematch={() => send({ t: "rematch" })}
      />,
    );

  // The draft, for you.
  if (view.phase === "draft" && me && me.pick < me.total)
    return wrap(
      <DraftView
        me={me}
        cards={view.cards}
        offset={offset}
        turnSeconds={rules.turnSeconds}
        ready={ready}
        act={act}
      />,
    );

  // Drafted: arrange until Ready (or the clock).
  if (view.phase === "draft" && me?.sheet && !me.ready)
    return wrap(
      <ArrangePanel
        title="Set up your team"
        sheet={me.sheet}
        endsAt={me.deadline}
        now={now}
        view={view}
        ready={ready}
        act={act}
        manage={manage}
        setManage={setManage}
      />,
    );

  if (view.phase === "draft")
    return wrap(
      <div className="flex flex-col gap-3">
        <p className="font-display text-lg font-bold">
          {you === null ? "The managers are drafting" : "Waiting for the others"}
        </p>
        <ul className="divide-y divide-line rounded-card border border-line bg-surface">
          {view.managers.map((m, i) => (
            <li key={i} className="flex justify-between px-3 py-2 text-sm">
              <span>{seatName(snap.seats, i)}</span>
              <span className="text-ink-2 tabular-nums">
                {m.pick < m.total
                  ? `Pick ${m.pick + 1}/${m.total}`
                  : m.ready
                    ? "Ready"
                    : "Setting up"}
              </span>
            </li>
          ))}
        </ul>
      </div>,
    );

  // Between matches: change your team for the next one.
  if (view.phase === "between" && me?.sheet && !view.managers[you as number]?.ready)
    return wrap(
      <>
        <LastRound view={view} snap={snap} />
        <ArrangePanel
          title="Next match"
          sheet={me.sheet}
          endsAt={view.windowEndsAt}
          now={now}
          view={view}
          ready={ready}
          act={act}
          manage={manage}
          setManage={setManage}
        />
      </>,
    );

  const fixture = view.rounds[view.round]?.find((f) => f.id === view.focus) ?? null;
  if (!fixture)
    return wrap(
      <>
        <LastRound view={view} snap={snap} />
        <p className="text-center text-sm text-ink-2">The next round starts soon.</p>
      </>,
    );
  const mySide =
    you !== null && "seat" in fixture.a && fixture.a.seat === you
      ? 0
      : you !== null && fixture.b !== "bye" && "seat" in fixture.b && fixture.b.seat === you
        ? 1
        : null;
  const names: [string, string] = [
    teamName(snap.seats, fixture.a, fixture.names[0]),
    teamName(snap.seats, fixture.b, fixture.names[1]),
  ];
  const others = (view.rounds[view.round] ?? []).filter(
    (f) => f.id !== fixture.id && f.b !== "bye",
  );
  return wrap(
    <>
      <MatchView
        key={fixture.id}
        fixture={fixture}
        names={names}
        cards={view.cards}
        msPerMinute={view.msPerMinute}
        offset={offset}
        mySide={mySide}
        breakFor={
          view.phase === "break" && mySide !== null && view.windowEndsAt
            ? { endsAt: view.windowEndsAt, ready: !!view.managers[you as number]?.ready }
            : null
        }
        ready={ready}
        act={act}
        subsPerMatch={rules.subsPerMatch}
        canSkip={view.mode === "solo"}
      />
      {others.length ? (
        <ul
          className="mt-2 divide-y divide-line rounded-card border border-line bg-surface text-sm"
          aria-label="Other matches"
        >
          {others.map((f) => (
            <li key={f.id} className="flex items-center gap-2 px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate text-right">
                {teamName(snap.seats, f.a, f.names[0])}
              </span>
              <span className="font-bold tabular-nums">
                {f.score ? `${f.score[0]}–${f.score[1]}` : "–"}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {f.b === "bye" ? "" : teamName(snap.seats, f.b, f.names[1])}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </>,
  );
}

function ArrangePanel({
  title,
  sheet,
  endsAt,
  now,
  view,
  ready,
  act,
  manage,
  setManage,
}: {
  title: string;
  sheet: TeamSheet;
  endsAt: number | null;
  now: number;
  view: FootballView;
  ready: boolean;
  act: (a: FootballAction) => void;
  manage: boolean;
  setManage: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-bold">{title}</p>
        {endsAt ? (
          <span className="text-sm font-semibold tabular-nums">{mmss(endsAt - now)}</span>
        ) : null}
      </div>
      <TeamEditor sheet={sheet} cards={view.cards} ready={ready} act={act} subsLeft={null} />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => setManage(true)}>
          Tactics and roles
        </Button>
        <Button disabled={!ready} onClick={() => act({ type: "ready" })}>
          Ready
        </Button>
      </div>
      <ManageSheet
        open={manage}
        onClose={() => setManage(false)}
        sheet={sheet}
        theirs={null}
        cards={view.cards}
        ready={ready}
        act={act}
        subsLeft={null}
      />
    </div>
  );
}

function LastRound({ view, snap }: { view: FootballView; snap: Snapshot }) {
  const last = view.rounds[view.round - 1] ?? view.rounds[view.round];
  if (!last) return null;
  return (
    <ul
      className="divide-y divide-line rounded-card border border-line bg-surface text-sm"
      aria-label="Results"
    >
      {last.map((f) => (
        <li key={f.id} className="flex items-center gap-2 px-3 py-1.5">
          <span className="min-w-0 flex-1 truncate text-right">
            {teamName(snap.seats, f.a, f.names[0])}
          </span>
          <span className="font-bold tabular-nums">
            {f.b === "bye" ? "bye" : f.result ? `${f.result.score[0]}–${f.result.score[1]}` : "–"}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {f.b === "bye" ? "" : teamName(snap.seats, f.b, f.names[1])}
          </span>
        </li>
      ))}
    </ul>
  );
}
