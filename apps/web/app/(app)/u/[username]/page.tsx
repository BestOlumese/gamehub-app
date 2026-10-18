import { PLACEMENT_GAMES } from "@gamehub/engine/matchmaking";
import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Trophy } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppHeader } from "@/components/app/app-header";
import { EmptyState } from "@/components/app/empty-state";
import { PageBanner } from "@/components/app/page-banner";
import { GAME_NAMES } from "@/lib/game-meta";
import { ago, poolName } from "@/lib/ratings/pools";
import { profileOf, type RecentMatch } from "@/server/profile";
import { requirePlayer } from "@/server/session";
import { FriendButton } from "@/components/presence/friend-button";
import { relationOf } from "@/server/friends";

export const metadata: Metadata = { title: "Profile", robots: { index: false } };

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

/** "Won", "Lost", "Draw" for two; "2nd" (or "=2nd") for more. */
function result(m: RecentMatch): string {
  if (m.players === 2) return m.shared ? "Draw" : m.place === 1 ? "Won" : "Lost";
  return `${m.shared ? "=" : ""}${ordinal(m.place)}`;
}

function where(m: RecentMatch): string {
  const name = GAME_NAMES[m.game as keyof typeof GAME_NAMES] ?? m.game;
  const clock = m.timeControl ? ` ${m.timeControl}` : "";
  const size = m.players > 2 ? ` · ${m.players} players` : "";
  const kind = m.kind === "quick" ? "" : m.kind === "tournament" ? " · tournament" : " · room";
  return `${name}${clock}${size}${kind}`;
}

async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const me = await requirePlayer();
  const p = await profileOf((await params).username);
  if (!p) notFound();
  const mine = p.id === me.id;
  const relation = mine ? null : await relationOf(me.id, p.id);
  return (
    <>
      <AppHeader user={me} />
      <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 sm:px-8">
        <PageBanner
          lead={
            <span className="block rounded-full border-4 border-surface shadow-[0_3px_0_var(--color-line-edge)]">
              <Avatar username={p.username} image={p.image} size={64} />
            </span>
          }
          title={<span className="text-2xl break-all">@{p.username}</span>}
          sub={`Playing since ${p.since.toLocaleDateString("en-NG", { month: "long", year: "numeric" })}`}
        >
          {p.podiums ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-surface px-3 py-0.5 text-sm font-semibold">
              <Trophy size={15} aria-hidden="true" className="text-accent" />
              {p.wins === 1 ? "1 tournament win" : `${p.wins} tournament wins`} ·{" "}
              {p.podiums === 1 ? "1 podium" : `${p.podiums} podiums`}
            </p>
          ) : null}
          {p.solo ? (
            <p className="mt-1 text-sm text-ink-2">
              Football solo run: best {p.solo.best}/4 ·{" "}
              {p.solo.runs === 1 ? "1 run" : `${p.solo.runs} runs`}
            </p>
          ) : null}
        </PageBanner>
        {relation && relation !== "self" ? (
          <FriendButton userId={p.id} relation={relation} />
        ) : null}

        <section aria-labelledby="games-h">
          <h2 id="games-h" className="mb-3 font-display text-xl font-extrabold tracking-tight">
            Games
          </h2>
          {p.cards.length ? (
            <ul className="grid grid-cols-2 gap-3">
              {p.cards.map((c) => (
                <li
                  key={`${c.game}-${c.variant}`}
                  className={`tone-${c.game} tile relative overflow-hidden p-4 pt-5`}
                >
                  <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1.5 bg-(--g)" />
                  <p className="truncate text-sm font-bold text-(--g)">
                    {poolName(c.game, c.variant)}
                  </p>
                  {c.rating !== null ? (
                    <p className="font-display text-3xl font-extrabold tabular-nums">{c.rating}</p>
                  ) : c.ranked ? (
                    <p className="mt-1 text-sm font-semibold text-ink-2">
                      Placement {c.ranked}/{PLACEMENT_GAMES}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-ink-2">Not ranked yet</p>
                  )}
                  <p className="mt-1 text-sm text-ink-2 tabular-nums">
                    {c.played} played · {Math.round((c.won / Math.max(1, c.played)) * 100)}% won
                    {c.currentStreak > 1 ? ` · ${c.currentStreak} in a row` : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState art="game-chess" title={mine ? "No games yet" : "Nothing played yet"}>
              {mine ? "Play a quick match or a room with friends, and your stats land here." : null}
            </EmptyState>
          )}
        </section>

        {p.recent.length ? (
          <section aria-labelledby="recent-h">
            <h2 id="recent-h" className="mb-3 font-display text-xl font-extrabold tracking-tight">
              Recent
            </h2>
            <ul className="divide-y divide-line tile">
              {p.recent.map((m) => {
                const delta =
                  m.ratingBefore !== null && m.ratingAfter !== null
                    ? m.ratingAfter - m.ratingBefore
                    : null;
                return (
                  <li
                    key={m.id}
                    className={`tone-${m.game} flex items-center gap-3 px-4 py-3 text-sm`}
                  >
                    <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-(--g)" />
                    <span className="min-w-0 flex-1 truncate">{where(m)}</span>
                    <span className="font-semibold">{result(m)}</span>
                    {delta !== null ? (
                      <span
                        className={`w-10 text-right font-semibold tabular-nums ${delta >= 0 ? "text-brand" : "text-danger"}`}
                      >
                        {delta >= 0 ? `+${delta}` : delta}
                      </span>
                    ) : null}
                    <span className="w-20 text-right text-ink-2">{ago(m.endedAt)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}

export default function Page({ params }: { params: Promise<{ username: string }> }) {
  return (
    <div className="min-h-dvh">
      <Suspense fallback={<div className="h-40" aria-busy="true" />}>
        <ProfilePage params={params} />
      </Suspense>
    </div>
  );
}
