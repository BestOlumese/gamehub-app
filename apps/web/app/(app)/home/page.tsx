import { buttonClasses } from "@gamehub/ui/forms/button";
import { Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/app/app-header";
import { GameGrid } from "@/components/home/game-grid";
import { NoticeBanner } from "@/components/home/notice-banner";
import { PageBanner } from "@/components/app/page-banner";
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
      <div className="mx-auto w-full max-w-content px-4 pt-6 sm:px-8 sm:pt-8">
        <PageBanner
          title={
            <>
              Hi, <span className="text-brand">@{user.username}</span>
            </>
          }
          sub="What are we playing?"
          art="hero-table"
          artOnPhones={false}
        >
          {record.podiums ? (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-surface px-3 py-1 text-sm font-semibold">
              <Trophy size={15} aria-hidden="true" className="text-accent" />
              {record.wins === 1 ? "1 tournament win" : `${record.wins} tournament wins`} ·{" "}
              {record.podiums === 1 ? "1 podium" : `${record.podiums} podiums`}
            </p>
          ) : null}
        </PageBanner>
        {notice ? (
          <div className="mt-4">
            <NoticeBanner text={notice} />
          </div>
        ) : null}
      </div>
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
          className="tile flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h2 id="join-h" className="font-display text-lg font-bold">
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
          <h2 id="games-h" className="mb-4 font-display text-xl font-extrabold tracking-tight">
            Pick a game
          </h2>
          <GameGrid />
        </section>

        <section
          aria-labelledby="tour-h"
          className="tone-trophy tile relative flex flex-col gap-4 overflow-hidden bg-(--g-soft) p-5 sm:flex-row sm:items-center sm:justify-between"
        >
          <span aria-hidden="true" className="pat absolute inset-0" />
          <div className="relative flex gap-3">
            <span className="grid size-12 shrink-0 -rotate-6 place-items-center rounded-control bg-(--g) text-white shadow-[0_3px_0_rgb(0_0_0/0.2)]">
              <Trophy size={24} aria-hidden="true" />
            </span>
            <div>
              <h2 id="tour-h" className="font-display text-lg font-bold">
                Run a tournament
              </h2>
              <p className="text-sm text-ink-2">
                4 to 32 players, any games in stages. Bots can fill in.
              </p>
            </div>
          </div>
          <Link href="/t/new" className={buttonClasses("primary", "md", "relative sm:w-auto")}>
            Set one up
          </Link>
        </section>
      </main>
    </div>
  );
}
