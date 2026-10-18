import { buttonClasses } from "@gamehub/ui/forms/button";
import { Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/app/app-header";
import { GameGrid } from "@/components/home/game-grid";
import { NoticeBanner } from "@/components/home/notice-banner";
import { FriendsStrip } from "@/components/presence/friends-strip";
import { JoinRoomForm } from "@/components/join/join-room-form";
import { requirePlayer } from "@/server/session";
import { tournamentRecord } from "@/server/tournaments";
import { noticeFor } from "@/server/moderation";

export const metadata: Metadata = { title: "Home", robots: { index: false } };

async function Greeting() {
  const user = await requirePlayer();
  // Results are a bonus line: a database hiccup mustn't take Home down.
  const [record, notice] = await Promise.all([
    tournamentRecord(user.id).catch(() => ({ wins: 0, podiums: 0 })),
    noticeFor(user.id).catch(() => null),
  ]);
  return (
    <>
      <AppHeader user={user} />
      <section className="mx-auto w-full max-w-content px-4 pt-8 sm:px-8 sm:pt-10">
        <h1 className="font-display text-3xl leading-[1.1] font-extrabold tracking-tight">
          Hi, <span className="text-brand">@{user.username}</span>
        </h1>
        <p className="mt-1 text-ink-2">What are we playing?</p>
        {record.podiums ? (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold">
            <Trophy size={15} aria-hidden="true" className="text-accent" />
            {record.wins === 1 ? "1 tournament win" : `${record.wins} tournament wins`} ·{" "}
            {record.podiums === 1 ? "1 podium" : `${record.podiums} podiums`}
          </p>
        ) : null}
        {notice ? (
          <div className="mt-4">
            <NoticeBanner text={notice} />
          </div>
        ) : null}
      </section>
    </>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-dvh">
      <Suspense fallback={<div className="h-40" aria-busy="true" />}>
        <Greeting />
      </Suspense>

      <main className="mx-auto w-full max-w-content space-y-8 px-4 py-6 sm:px-8">
        <section
          aria-labelledby="join-h"
          className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2 id="join-h" className="font-bold">
              Got a room code?
            </h2>
            <p className="text-sm text-ink-2">Type the 6 letters your friend sent you.</p>
          </div>
          <div className="w-full sm:max-w-sm">
            <JoinRoomForm />
          </div>
        </section>

        <FriendsStrip />

        <section aria-labelledby="games-h">
          <h2 id="games-h" className="mb-4 text-lg font-bold">
            Pick a game
          </h2>
          <GameGrid />
        </section>

        <section
          aria-labelledby="tour-h"
          className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
              <Trophy size={22} aria-hidden="true" />
            </span>
            <div>
              <h2 id="tour-h" className="font-bold">
                Run a tournament
              </h2>
              <p className="text-sm text-ink-2">
                4 to 32 players, any games in stages. Bots can fill in.
              </p>
            </div>
          </div>
          <Link href="/t/new" className={buttonClasses("primary", "md", "sm:w-auto")}>
            Set one up
          </Link>
        </section>
      </main>
    </div>
  );
}
