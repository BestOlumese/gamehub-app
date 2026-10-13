"use client";

import {
  formation,
  GROUP,
  momentum,
  playerRatings,
  whyLines,
  type Card,
  type FixtureView,
} from "@gamehub/engine/football";

/**
 * The full-time report (design decision, Oct 2026): why you won or lost, the stats, who was on
 * top minute by minute, and every player's rating with the player of the match.
 */
export function MatchReport({
  fixture,
  side,
  names,
  cards,
  colours,
}: {
  fixture: FixtureView;
  /** Whose point of view the reasons take (yours, or the home side for a spectator). */
  side: 0 | 1;
  names: [string, string];
  cards: Record<string, Card>;
  colours: readonly [string, string];
}) {
  const teams = fixture.teams;
  if (!teams || !fixture.result) return null;
  const log = fixture.log;
  const defenders = teams.map((t) =>
    formation(t.formation).slots.flatMap((sl, i) =>
      GROUP[sl.pos] === "DEF" ? [t.xi[i]?.id as string] : [],
    ),
  ) as [string[], string[]];
  const ratings = playerRatings(log, teams, defenders);
  const best = [...ratings].sort((a, b) => b.rating - a.rating)[0];
  const why = whyLines(log, side, fixture.live?.stats.xg);
  const mo = momentum(log);
  const st = fixture.live?.stats;
  const [a, b] = fixture.result.score;
  const name = (id: string) => cards[id]?.short ?? "";
  const row = (label: string, x: string | number, y: string | number) => (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm tabular-nums">
      <span className="text-right font-semibold">{x}</span>
      <span className="w-24 text-center text-xs text-ink-2">{label}</span>
      <span className="font-semibold">{y}</span>
    </div>
  );
  const bars = mo.buckets;
  const w = 100 / Math.max(1, bars.length);
  return (
    <section
      className="space-y-4 rounded-card border border-line bg-surface p-3"
      aria-label="Match report"
    >
      <div className="text-center">
        <p className="text-xs font-semibold tracking-wide text-ink-2 uppercase">Match report</p>
        <p className="font-display text-lg font-bold tabular-nums">
          {names[0]} {a}–{b} {names[1]}
        </p>
      </div>

      {why.length ? (
        <ul className="space-y-1 text-sm">
          {why.map((l) => (
            <li key={l} className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
              {l}
            </li>
          ))}
        </ul>
      ) : null}

      {st ? (
        <div className="space-y-1">
          {row(
            "Shots (on target)",
            `${st.shots[0]} (${st.onTarget[0]})`,
            `${st.shots[1]} (${st.onTarget[1]})`,
          )}
          {row("xG", st.xg[0].toFixed(1), st.xg[1].toFixed(1))}
          {row("Possession", `${st.possession[0]}%`, `${st.possession[1]}%`)}
          {row("Corners", st.corners[0], st.corners[1])}
          {row("Cards", `${st.yellows[0]} / ${st.reds[0]}`, `${st.yellows[1]} / ${st.reds[1]}`)}
        </div>
      ) : null}

      <div>
        <p className="mb-1 text-xs font-semibold text-ink-2">Who was on top</p>
        <svg
          viewBox="0 0 100 40"
          preserveAspectRatio="none"
          className="h-16 w-full rounded-control bg-surface-2"
          role="img"
          aria-label={`Momentum: ${names[0]} above the line, ${names[1]} below; goals marked`}
        >
          <line
            x1="0"
            y1="20"
            x2="100"
            y2="20"
            stroke="currentColor"
            strokeOpacity="0.2"
            strokeWidth="0.3"
          />
          {bars.map((v, i) => (
            <rect
              key={i}
              x={i * w + w * 0.15}
              width={w * 0.7}
              y={v >= 0 ? 20 - v * 18 : 20}
              height={Math.abs(v) * 18}
              fill={colours[v >= 0 ? 0 : 1]}
              opacity="0.85"
            />
          ))}
          {mo.goals.map((g, i) => (
            <circle
              key={i}
              cx={g.bucket * w + w / 2}
              cy={g.side === 0 ? 3 : 37}
              r="1.8"
              fill="#fff"
              stroke={colours[g.side]}
              strokeWidth="0.8"
            />
          ))}
        </svg>
        <div className="mt-0.5 flex justify-between text-[10px] text-ink-3">
          <span>0&apos;</span>
          <span>45&apos;</span>
          <span>90&apos;</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {([0, 1] as const).map((s) => (
          <div key={s}>
            <p className="mb-1 truncate text-xs font-semibold" style={{ color: colours[s] }}>
              {names[s]}
            </p>
            <ul className="space-y-0.5">
              {ratings
                .filter((r) => r.side === s)
                .sort((x, y) => y.rating - x.rating)
                .map((r) => (
                  <li key={r.id} className="flex items-center gap-1.5 text-sm">
                    <span
                      className={`w-9 shrink-0 rounded px-1 text-center text-xs font-bold tabular-nums ${r.rating >= 7.5 ? "bg-brand text-white" : r.rating < 6 ? "bg-danger-soft text-danger-strong" : "bg-surface-2"}`}
                    >
                      {r.rating.toFixed(1)}
                    </span>
                    <span className="min-w-0 truncate">
                      {name(r.id)}
                      {r.sub ? <span className="text-ink-3"> (sub)</span> : null}
                    </span>
                    {best && r.id === best.id ? (
                      <span className="ml-auto shrink-0 rounded-full bg-accent px-1.5 text-[10px] font-bold">
                        POTM
                      </span>
                    ) : null}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
