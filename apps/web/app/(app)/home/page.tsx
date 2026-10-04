import type { Metadata } from "next";
import { Suspense } from "react";
import { AppHeader } from "@/components/app/app-header";
import { GameGrid } from "@/components/home/game-grid";
import { JoinRoomForm } from "@/components/join/join-room-form";
import { requirePlayer } from "@/server/session";

export const metadata: Metadata = { title: "Home", robots: { index: false } };

async function Greeting() {
  const user = await requirePlayer();
  return (
    <>
      <AppHeader user={user} />
      <section className="mx-auto w-full max-w-content px-4 pt-8 sm:px-8 sm:pt-10">
        <h1 className="font-display text-3xl leading-[1.1] font-extrabold tracking-tight">
          Hi, <span className="text-brand">@{user.username}</span>
        </h1>
        <p className="mt-1 text-ink-2">What are we playing?</p>
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

        <section aria-labelledby="games-h">
          <h2 id="games-h" className="mb-4 text-lg font-bold">
            Pick a game
          </h2>
          <GameGrid />
        </section>
      </main>
    </div>
  );
}
