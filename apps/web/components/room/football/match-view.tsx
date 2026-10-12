"use client";

import {
  commentary,
  SHOUTS,
  type Card,
  type FixtureView,
  type FootballAction,
  type MatchEvent,
  type Shout,
} from "@gamehub/engine/football";
import { Button } from "@gamehub/ui/forms/button";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRoom } from "@/lib/room/store";
import { sfx } from "../sounds";
import { mmss } from "../use-now";
import { sendChange, useChangeWaiting } from "./live-changes";
import { ManageSheet, styleName } from "./manage-sheet";
import { LivePitch } from "./live-pitch";
import { clockOf, schedule, scoreOf, shown, statsOf } from "./playback";

const COLOURS: [string, string] = ["#2F6FD6", "#E07A2E"];
const SHOUT_LABEL: Record<Shout, string> = {
  attack: "Attack",
  hold: "Hold",
  press: "Press",
  counter: "Counter",
};

/** A line of commentary with the score as it stood at that moment. */
function feedOf(
  events: readonly MatchEvent[],
  names: [string, string],
  cards: Record<string, Card>,
): Array<{ key: string; text: string; big: "goal" | "red" | "pen" | null; m: number }> {
  const score: [number, number] = [0, 0];
  const nm = {
    player: (id: string) => cards[id]?.short ?? "",
    team: (s: 0 | 1) => names[s],
  };
  const out: Array<{ key: string; text: string; big: "goal" | "red" | "pen" | null; m: number }> =
    [];
  events.forEach((e, i) => {
    if (e.t === "goal") score[e.team]++;
    const text = commentary(e, nm, score);
    if (!text) return;
    const big =
      e.t === "goal"
        ? "goal"
        : e.t === "foul" && (e.card === "red" || e.card === "second_yellow")
          ? "red"
          : e.t === "pen" && !e.scored
            ? "pen"
            : null;
    out.push({ key: `${i}-${e.t}`, text, big, m: e.m });
  });
  return out.reverse();
}

export function MatchView({
  fixture,
  names,
  cards,
  msPerMinute,
  offset,
  mySide,
  breakFor,
  ready,
  act,
  subsPerMatch,
  canSkip,
  highlights,
}: {
  /** Room rule: quiet minutes fly by, attacks play out slower. */
  highlights: boolean;
  subsPerMatch: number;
  /** Solo run: skip the rest of the half (no one else to wait for). */
  canSkip: boolean;
  fixture: FixtureView;
  names: [string, string];
  cards: Record<string, Card>;
  msPerMinute: number;
  offset: number;
  /** Your side in this match, or null (watching). */
  mySide: 0 | 1 | null;
  /** A break you need to answer: its end time and whether you're done. */
  breakFor: { endsAt: number; ready: boolean } | null;
  ready: boolean;
  act: (a: FootballAction) => void;
}) {
  const soundOn = useRoom((s) => s.soundOn);
  const [manage, setManage] = useState(false);
  const waiting = useChangeWaiting();
  // Playback ticks every 200 ms.
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), 200);
    return () => clearInterval(t);
  }, [offset]);
  const live = fixture.live;
  const timed = useMemo(
    () => schedule(fixture.log, fixture.startedAt, msPerMinute, highlights),
    [fixture.log, fixture.startedAt, msPerMinute, highlights],
  );
  const events = shown(timed, now);
  const { score, pens } = scoreOf(events);
  const half = live?.half ?? 1;
  const clock = clockOf(events, half);
  const stats = live ? statsOf(live.base, events, half) : null;
  const feed = feedOf(events, names, cards);
  const ended = !!fixture.result && events.length === timed.length;
  const atBreak = !!breakFor && events.length === timed.length;

  // A goal: the scoreboard pulses and a short crowd sound plays (design decision).
  const goals = score[0] + score[1];
  const seen = useRef(goals);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (goals > seen.current) {
      if (soundOn) sfx.goal();
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 900);
      seen.current = goals;
      return () => clearTimeout(t);
    }
    seen.current = goals;
  }, [goals, soundOn]);

  const mine = mySide !== null && live ? live.now[mySide] : null;
  const theirs = mySide !== null && live ? live.tactics[mySide === 0 ? 1 : 0] : null;
  const subsLeft =
    mySide !== null && live
      ? Math.max(0, subsPerMatch + (half >= 3 ? 1 : 0) - (live.subsUsed[mySide] ?? 0))
      : null;

  return (
    <div className="flex flex-1 flex-col gap-2">
      {/* Scoreboard: managers' names, score, minute. */}
      <div
        className={`flex items-center gap-2 rounded-card border border-line bg-surface px-3 py-2 shadow-sm transition-transform ${pulse ? "scale-[1.02] ring-2 ring-accent" : ""}`}
        aria-live="polite"
      >
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 font-bold">
          <span className="truncate">{names[0]}</span>
          <TeamDot colour={COLOURS[0]} />
        </span>
        <span className="font-display text-2xl font-extrabold tabular-nums">
          {score[0]}–{score[1]}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 font-bold">
          <TeamDot colour={COLOURS[1]} />
          <span className="truncate">{names[1]}</span>
        </span>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold tabular-nums">
          {clock}
        </span>
      </div>
      {pens ? (
        <p className="text-center text-sm font-semibold tabular-nums">
          Penalties {pens[0]}–{pens[1]}
        </p>
      ) : null}
      {stats ? (
        <p className="flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-xs text-ink-2 tabular-nums">
          <span>
            Poss {stats.possession[0]}–{stats.possession[1]}%
          </span>
          <span>
            Shots {stats.shots[0]} ({stats.onTarget[0]}) – {stats.shots[1]} ({stats.onTarget[1]})
          </span>
          <span>
            xG {stats.xg[0].toFixed(1)}–{stats.xg[1].toFixed(1)}
          </span>
          <span>
            Corners {stats.corners[0]}–{stats.corners[1]}
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-3 w-2 rounded-[2px] bg-accent"
              aria-label="Yellow cards"
            />
            {stats.yellows[0]}–{stats.yellows[1]}
            <span
              className="ml-1 inline-block h-3 w-2 rounded-[2px] bg-danger"
              aria-label="Red cards"
            />
            {stats.reds[0]}–{stats.reds[1]}
          </span>
        </p>
      ) : null}
      {fixture.teams && live ? (
        <LivePitch
          timed={timed}
          now={now}
          offset={offset}
          perMinute={msPerMinute}
          mySide={mySide}
          fit={live.fit ?? null}
          kick={fixture.teams}
          current={live.now}
          cards={cards}
          colours={COLOURS}
        />
      ) : null}

      {atBreak && breakFor && mySide !== null ? (
        <div className="rounded-card border border-accent bg-accent-soft p-3">
          <p className="font-bold">
            {clock === "HT" ? "Half time" : "Break"} · {mmss(breakFor.endsAt - now)}
          </p>
          <p className="text-sm text-ink-2">Change tactics or make subs, then tap Ready.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setManage(true)}>
              Manage
            </Button>
            <Button disabled={!ready || breakFor.ready} onClick={() => act({ type: "ready" })}>
              {breakFor.ready ? "Waiting…" : "Ready"}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Commentary: newest on top; goals, red cards and missed penalties as cards. */}
      <ol className="flex max-h-[30dvh] flex-col gap-1.5 overflow-y-auto" aria-label="Commentary">
        {feed.map((l) =>
          l.big ? (
            <li
              key={l.key}
              className={`rounded-card border px-3 py-2 font-bold shadow-sm ${l.big === "goal" ? "border-accent bg-accent-soft" : "border-danger bg-danger-soft"}`}
            >
              {l.text}
            </li>
          ) : (
            <li key={l.key} className="px-1 text-sm">
              {l.text}
            </li>
          ),
        )}
      </ol>

      {mySide !== null && !ended && !atBreak && mine ? (
        <div className="sticky bottom-0 mt-auto flex flex-col gap-1.5 bg-paper pt-2">
          <div className="grid grid-cols-4 gap-1.5" role="toolbar" aria-label="Shouts">
            {(Object.keys(SHOUTS) as Shout[]).map((s) => {
              const on = JSON.stringify(SHOUTS[s]) === JSON.stringify(mine.tactics);
              return (
                <Button
                  key={s}
                  size="md"
                  variant={on ? "primary" : "secondary"}
                  className="px-1"
                  aria-pressed={on}
                  onClick={() =>
                    sendChange("tactics", () => act({ type: "shout", shout: s }), true)
                  }
                >
                  {SHOUT_LABEL[s]}
                </Button>
              );
            })}
          </div>
          <div className={`grid gap-1.5 ${canSkip ? "grid-cols-2" : "grid-cols-1"}`}>
            <Button size="md" variant="secondary" onClick={() => setManage(true)}>
              Manage{subsLeft !== null ? ` · ${subsLeft} subs` : ""}
            </Button>
            {canSkip ? (
              <Button
                size="md"
                variant="ghost"
                disabled={!ready}
                onClick={() => act({ type: "skip" })}
              >
                Skip half
              </Button>
            ) : null}
          </div>
          {waiting ? (
            <p className="text-center text-xs text-ink-2" aria-live="polite">
              Sending your change…
            </p>
          ) : theirs ? (
            <p className="text-center text-xs text-ink-2">They play: {styleName(theirs)}</p>
          ) : null}
        </div>
      ) : null}

      {mine ? (
        <ManageSheet
          open={manage}
          onClose={() => setManage(false)}
          sheet={mine}
          theirs={theirs}
          cards={cards}
          ready={ready}
          act={act}
          subsLeft={subsLeft}
          off={live?.off[mySide as 0 | 1]}
          fit={live?.fit ?? null}
          live={!atBreak}
        />
      ) : null}
    </div>
  );
}

/** A team's colour on the live pitch, next to its name on the scoreboard. */
function TeamDot({ colour }: { colour: string }) {
  return (
    <span
      className="inline-block size-2.5 shrink-0 rounded-full border border-white shadow-[0_0_0_1px_rgb(0_0_0/0.15)]"
      style={{ background: colour }}
      aria-hidden="true"
    />
  );
}
