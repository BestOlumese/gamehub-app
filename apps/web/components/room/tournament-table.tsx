"use client";

import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Button } from "@gamehub/ui/forms/button";
import { Bot, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Snapshot } from "@/lib/room/store";
import { useRoom } from "@/lib/room/store";

type Tour = NonNullable<Snapshot["room"]["tournament"]>;

/** Under the top bar at a tournament table: where this is, and the series so far. */
export function TableStrip({ tour, snap }: { tour: Tour; snap: Snapshot }) {
  const series = tour.bestOf > 1 && snap.seats.length === 2;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line bg-accent-soft px-4 py-2 text-sm">
      <span className="flex min-w-0 items-center gap-2 font-semibold">
        <Trophy size={16} aria-hidden="true" className="shrink-0 text-accent" />
        <span className="truncate">{tour.label}</span>
      </span>
      {series ? (
        <span className="shrink-0 font-display font-bold tabular-nums">
          Best of {tour.bestOf} · {tour.wins[0] ?? 0}–{tour.wins[1] ?? 0}
        </span>
      ) : null}
    </div>
  );
}

/** Before a tournament table or quick-match room starts: who's here, and when it starts anyway. */
export function TableWaiting({ tour, snap }: { tour: Pick<Tour, "startsAt">; snap: Snapshot }) {
  const offset = useRoom((s) => s.offset);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const left = tour.startsAt ? Math.max(0, Math.ceil((tour.startsAt - (now + offset)) / 1000)) : 0;
  const missing = snap.seats.filter((s) => s.status === "away").length;
  return (
    <div className="mx-auto w-full max-w-md space-y-5 px-4 py-8">
      <div className="text-center">
        <p className="font-display text-2xl font-extrabold tracking-tight">Your table</p>
        <p className="text-ink-2" aria-live="polite">
          {missing
            ? `Starting when everyone's here, or in ${left} s. Anyone missing gets a bot until they arrive.`
            : "Everyone's here. Starting…"}
        </p>
      </div>
      <ul className="divide-y divide-line tile">
        {snap.seats.map((s) => (
          <li key={s.index} className="flex items-center gap-3 px-4 py-3">
            {s.userId ? (
              <span className={s.status === "away" ? "opacity-40 grayscale" : ""}>
                <Avatar username={s.name} image={s.avatar} size={36} />
              </span>
            ) : (
              <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-ink-2">
                <Bot size={18} aria-hidden="true" />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate font-semibold">
              {s.index === snap.you ? "You" : s.userId ? `@${s.name}` : s.name}
            </span>
            <span className="text-sm text-ink-2">
              {s.status === "connected"
                ? "Here"
                : s.status === "away"
                  ? "On the way"
                  : s.status === "left"
                    ? "Bot playing"
                    : "Bot"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const BACK_S = 5;

/**
 * After a game at a tournament table: the next game of the series, or back to the tournament
 * (by itself after 5 s). Covers the game's own result card (no rematches in a tournament).
 */
export function TableDone({ tour, snap }: { tour: Tour; snap: Snapshot }) {
  const router = useRouter();
  const [left, setLeft] = useState(BACK_S);
  const href = `/t/${tour.code}`;
  useEffect(() => {
    if (!tour.done) return;
    if (left <= 0) {
      router.push(href);
      return;
    }
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [left, tour.done, href, router]);
  const series = tour.bestOf > 1 && snap.seats.length === 2;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:pb-8">
      <div
        role="dialog"
        aria-labelledby="table-done"
        className="mx-auto max-w-md rounded-card border border-line bg-surface p-6 shadow-lg transition-[translate,opacity] duration-(--dur-sheet) ease-standard starting:translate-y-full starting:opacity-0"
      >
        <h2 id="table-done" className="font-display text-2xl font-extrabold tracking-tight">
          {tour.done ? "Table finished" : "Next game coming up"}
        </h2>
        <p className="mt-1 text-ink-2">
          {tour.done
            ? "The bracket shows who goes through."
            : series
              ? `Best of ${tour.bestOf}: ${tour.wins[0] ?? 0}–${tour.wins[1] ?? 0} so far.`
              : "Still level: one more game decides it."}
        </p>
        {tour.done ? (
          <Button block className="mt-5" onClick={() => router.push(href)}>
            Back to the tournament ({left})
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Under the top bar in a quick-match room: ranked or not, and the pool. */
export function QuickStrip({ snap }: { snap: Snapshot }) {
  const q = snap.room.quick;
  if (!q) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line bg-brand-soft px-4 py-2 text-sm font-semibold">
      <span>Quick match{q.timeControl ? ` · ${q.timeControl}` : ""}</span>
      <span className={q.ranked ? "text-brand-strong" : "text-ink-2"}>
        {q.ranked ? "Ranked" : "Not ranked (bots)"}
      </span>
    </div>
  );
}

/** The queue page for another game like this one (quick match's "Play again"). */
export function playAgainHref(snap: Snapshot): string {
  const q = snap.room.quick;
  const params = new URLSearchParams({ g: snap.room.game, n: String(snap.seats.length) });
  if (q?.timeControl && snap.room.game === "chess") {
    const [m, inc] = q.timeControl.split("+").map(Number);
    params.set("tc", `${(m ?? 3) * 60}+${inc ?? 0}`);
  }
  if (snap.room.game === "draughts" && q) params.set("v", q.variant);
  return `/play/quick?${params}`;
}
