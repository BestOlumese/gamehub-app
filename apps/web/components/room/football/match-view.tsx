"use client";

import {
  commentary,
  ratingDeltas,
  segmentStart,
  SHOUTS,
  TALKS,
  TIMEOUTS_PER_MATCH,
  type Talk,
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
import { meterOf, tipFor, type Meter } from "./assistant";
import { TEAM_COLOURS } from "./look";
import { sendChange, useChangeWaiting } from "./live-changes";
import { ManageSheet, styleName } from "./manage-sheet";
import { LivePitch } from "./live-pitch";
import { clockOf, matchNow, schedule, scoreOf, shown, statsOf, type Timing } from "./playback";

const COLOURS = TEAM_COLOURS;
const TALK_LABEL: Record<Talk, string> = {
  fire: "Fire up",
  calm: "Calm down",
  praise: "Praise",
  demand: "Demand more",
};
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
  offset,
  mySide,
  breakFor,
  ready,
  act,
  subsPerMatch,
  canSkip,
  timing,
  talk = null,
}: {
  /** This break's team talk and how the squad took it (yours alone). */
  talk?: { pick: Talk; reaction: "good" | "neutral" | "bad"; text: string } | null;
  /** The screens' timing as the server plays it (shared timeline). */
  timing: Timing;
  subsPerMatch: number;
  /** Solo run: skip the rest of the half (no one else to wait for). */
  canSkip: boolean;
  fixture: FixtureView;
  names: [string, string];
  cards: Record<string, Card>;
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
  const { timed, tl } = useMemo(
    () => schedule(fixture.log, fixture.startedAt, timing),
    [fixture.log, fixture.startedAt, timing],
  );
  // A timeout freezes the match clock (and everything shown).
  const paused = fixture.pause && now < fixture.pause.until ? fixture.pause : null;
  const clockNow = matchNow(now, fixture.pause);
  const events = shown(timed, clockNow);
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

  // The matchup meter and your assistant (only the score and minute already shown).
  const meter = mySide !== null && live?.matchup ? meterOf(live.matchup, mySide) : null;
  const minuteShown = events.findLast((e) => e.t === "ball")?.m ?? 0;
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const tip =
    mySide !== null && live?.matchup && mine && !ended
      ? tipFor({
          matchup: live.matchup,
          mySide,
          sheet: mine,
          fit: live.fit ?? null,
          cards,
          subsLeft: subsLeft ?? 0,
          score,
          minute: minuteShown,
        })
      : null;
  const showTip = tip && !dismissed.has(tip.key) ? tip : null;
  // Live ratings: earlier halves from the server, this half from what's been shown.
  const ratings = (() => {
    if (mySide === null || !fixture.teams) return undefined;
    const now_ = ratingDeltas(events.slice(segmentStart(events)));
    const base = fixture.ratingBase ?? {};
    const starters = new Set(fixture.teams[mySide].xi.map((x) => x.id));
    const out: Record<string, number> = {};
    for (const x of mine?.xi ?? []) {
      const r = (starters.has(x.id) ? 6.4 : 6.2) + (base[x.id] ?? 0) + (now_[x.id] ?? 0);
      out[x.id] = Math.round(Math.min(10, Math.max(3, r)) * 10) / 10;
    }
    return out;
  })();
  const timeoutsLeft = mySide !== null ? TIMEOUTS_PER_MATCH - (fixture.timeouts?.[mySide] ?? 0) : 0;

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
          tl={tl}
          timed={timed}
          now={clockNow}
          pause={fixture.pause}
          offset={offset}
          mySide={mySide}
          fit={live.fit ?? null}
          kick={fixture.teams}
          current={live.now}
          cards={cards}
          colours={COLOURS}
        />
      ) : null}
      {meter ? (
        <MatchupMeter
          // The tip already says it: don't say it twice.
          meter={meter.why && showTip?.text.startsWith(meter.why) ? { ...meter, why: null } : meter}
        />
      ) : null}

      {atBreak && breakFor && mySide !== null ? (
        <div className="rounded-card border border-accent bg-accent-soft p-3">
          <p className="font-bold">
            {clock === "HT" ? "Half time" : "Break"} · {mmss(breakFor.endsAt - now)}
          </p>
          <p className="text-sm text-ink-2">Change tactics or make subs, then tap Ready.</p>
          <div className="mt-2">
            <p className="text-xs font-semibold text-ink-2">Team talk</p>
            {talk ? (
              <p
                className={`mt-1 text-sm font-semibold ${talk.reaction === "good" ? "text-brand-strong" : talk.reaction === "bad" ? "text-danger-strong" : ""}`}
                aria-live="polite"
              >
                {talk.text}
              </p>
            ) : (
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {TALKS.map((k) => (
                  <Button
                    key={k}
                    size="md"
                    variant="secondary"
                    disabled={!ready}
                    onClick={() => act({ type: "talk", talk: k })}
                  >
                    {TALK_LABEL[k]}
                  </Button>
                ))}
              </div>
            )}
          </div>
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

      {paused ? (
        <div className="rounded-card border border-accent bg-accent-soft p-3" role="status">
          <p className="font-bold">
            {canSkip ? "Paused" : `Timeout · ${mmss(paused.until - now)}`}
          </p>
          <p className="text-sm text-ink-2">
            {paused.by === mySide
              ? "Change tactics or make subs; the match waits."
              : `${names[paused.by]} called a timeout. You can make changes too.`}
          </p>
          {mySide !== null ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setManage(true)}>
                Manage
              </Button>
              {paused.by === mySide ? (
                <Button disabled={!ready} onClick={() => act({ type: "resume" })}>
                  Resume
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {showTip ? (
        <div
          className="rounded-card border border-brand bg-brand-soft px-3 py-2 shadow-sm"
          role="status"
        >
          <p className="text-xs font-semibold text-brand-strong">Assistant</p>
          <p className="text-sm font-semibold">{showTip.text}</p>
          <div className="mt-1.5 flex justify-end gap-2">
            <Button
              size="md"
              variant="ghost"
              onClick={() => setDismissed((d) => new Set([...d, showTip.key]))}
            >
              Not now
            </Button>
            {showTip.action ? (
              <Button
                size="md"
                disabled={!ready}
                onClick={() => {
                  const a = showTip.action as FootballAction;
                  sendChange(
                    a.type === "swap" ? `swap:${JSON.stringify([a.a, a.b])}` : "tactics",
                    () => act(a),
                    !atBreak && !paused,
                  );
                  setDismissed((d) => new Set([...d, showTip.key]));
                }}
              >
                Do it
              </Button>
            ) : null}
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
                    sendChange("tactics", () => act({ type: "shout", shout: s }), !paused)
                  }
                >
                  {SHOUT_LABEL[s]}
                </Button>
              );
            })}
          </div>
          <div className={`grid gap-1.5 ${canSkip ? "grid-cols-3" : "grid-cols-2"}`}>
            <Button size="md" variant="secondary" onClick={() => setManage(true)}>
              Manage{subsLeft !== null ? ` · ${subsLeft} subs` : ""}
            </Button>
            <Button
              size="md"
              variant="secondary"
              disabled={!ready || !!paused || (!canSkip && timeoutsLeft <= 0)}
              onClick={() => act({ type: "timeout" })}
            >
              {canSkip ? "Pause" : `Timeout · ${timeoutsLeft}`}
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
          opponent={mySide !== null && live ? live.now[mySide === 0 ? 1 : 0] : null}
          cards={cards}
          ready={ready}
          act={act}
          subsLeft={subsLeft}
          off={live?.off[mySide as 0 | 1]}
          fit={live?.fit ?? null}
          ratings={ratings}
          live={!atBreak && !paused}
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

/** Who has the tactical edge, as a bar from the middle, and the biggest reason why. */
function MatchupMeter({ meter }: { meter: Meter }) {
  const pct = Math.round(Math.abs(meter.value) * 50);
  const good = meter.value >= 0;
  return (
    <div
      className="px-1"
      aria-label={`Tactics: ${meter.label}${meter.why ? `. ${meter.why}` : ""}`}
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="w-12 shrink-0 font-semibold text-ink-2">Tactics</span>
        <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
          <span className="absolute inset-y-0 left-1/2 w-px bg-ink-3" />
          <span
            className={`absolute inset-y-0 rounded-full motion-safe:transition-all motion-safe:duration-500 ${good ? "bg-brand" : "bg-danger"}`}
            style={good ? { left: "50%", width: `${pct}%` } : { right: "50%", width: `${pct}%` }}
          />
        </span>
        <span
          className={`w-28 shrink-0 text-right font-semibold ${good ? "text-brand-strong" : "text-danger-strong"}`}
        >
          {meter.label}
        </span>
      </div>
      {meter.why ? <p className="mt-0.5 text-xs text-ink-2">{meter.why}</p> : null}
    </div>
  );
}
