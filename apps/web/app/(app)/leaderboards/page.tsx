import { Avatar } from "@gamehub/ui/data-display/avatar";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/app/app-header";
import { GAME_NAMES } from "@/lib/game-meta";
import { POOLS, variantName } from "@/lib/ratings/pools";
import { boardOf } from "@/server/profile";
import { requirePlayer } from "@/server/session";

export const metadata: Metadata = { title: "Leaderboards", robots: { index: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;

const chip = (on: boolean) =>
  `shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors duration-(--dur-press) ${on ? "border-brand bg-brand text-white" : "border-line bg-surface hover:border-ink-3"}`;

async function Boards({ searchParams }: { searchParams: Search }) {
  const me = await requirePlayer();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const pool = POOLS.find((p) => p.game === one("game")) ?? (POOLS[0] as (typeof POOLS)[number]);
  const variant = pool.variants.includes(one("v") ?? "")
    ? (one("v") as string)
    : (pool.variants[0] as string);
  const period = one("p") === "week" ? "week" : "all";
  const rows = await boardOf(pool.game, variant, period);
  const href = (o: { game?: string; v?: string; p?: string }) => {
    const q = new URLSearchParams({
      game: o.game ?? pool.game,
      v: o.v ?? variant,
      p: o.p ?? period,
    });
    return `/leaderboards?${q}`;
  };
  const myIndex = rows.findIndex((r) => r.userId === me.id);
  return (
    <>
      <AppHeader user={me} />
      <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8 sm:px-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Leaderboards</h1>
        <nav aria-label="Game" className="flex gap-1.5 overflow-x-auto pb-1">
          {POOLS.map((p) => (
            <Link
              key={p.game}
              href={href({ game: p.game, v: p.variants[0] })}
              aria-current={p.game === pool.game ? "page" : undefined}
              className={chip(p.game === pool.game)}
            >
              {GAME_NAMES[p.game]}
            </Link>
          ))}
        </nav>
        {pool.variants.length > 1 ? (
          <nav aria-label="Pool" className="flex gap-1.5">
            {pool.variants.map((v) => (
              <Link
                key={v}
                href={href({ v })}
                aria-current={v === variant ? "page" : undefined}
                className={chip(v === variant)}
              >
                {variantName(v)}
              </Link>
            ))}
          </nav>
        ) : null}
        <nav
          aria-label="Period"
          className="grid grid-cols-2 rounded-control border border-line bg-surface p-1"
        >
          {(["week", "all"] as const).map((p) => (
            <Link
              key={p}
              href={href({ p })}
              aria-current={p === period ? "page" : undefined}
              className={`rounded-[calc(var(--radius-control)-4px)] py-2 text-center text-sm font-semibold ${p === period ? "bg-brand-soft text-brand-strong" : "text-ink-2"}`}
            >
              {p === "week" ? "This week" : "All time"}
            </Link>
          ))}
        </nav>
        {rows.length ? (
          <ol className="divide-y divide-line rounded-card border border-line bg-surface">
            {rows.map((r, i) => (
              <li
                key={r.userId}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm ${i === myIndex ? "bg-brand-soft" : ""}`}
              >
                <span className="w-7 text-right font-semibold text-ink-2 tabular-nums">
                  {i + 1}
                </span>
                <Avatar username={r.username} image={r.image} size={28} />
                <Link
                  href={`/u/${r.username}`}
                  className="min-w-0 flex-1 truncate font-semibold hover:underline"
                >
                  {i === myIndex ? "You" : `@${r.username}`}
                </Link>
                <span className="font-display font-bold tabular-nums">
                  {period === "week"
                    ? `${r.value >= 0 ? "+" : ""}${r.value}`
                    : r.placed
                      ? r.value
                      : `Placement ${r.played}/10`}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-card border border-line bg-surface p-4 text-ink-2">
            {period === "week"
              ? "Nobody has played 5 ranked games here this week yet."
              : "No ranked games here yet. Quick match to get on the board."}
          </p>
        )}
        {myIndex < 0 && rows.length ? (
          <p className="px-1 text-sm text-ink-2">You&apos;re not on this board yet.</p>
        ) : null}
      </main>
    </>
  );
}

export default function LeaderboardsPage({ searchParams }: { searchParams: Search }) {
  return (
    <div className="min-h-dvh">
      <Suspense fallback={<div className="h-40" aria-busy="true" />}>
        <Boards searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
