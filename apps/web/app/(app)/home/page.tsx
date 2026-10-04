import type { Metadata } from "next";
import { Suspense } from "react";
import { AppHeader } from "@/components/app/app-header";
import { JoinRoomForm } from "@/components/join/join-room-form";
import { games } from "@/lib/games";
import { requirePlayer } from "@/server/session";

export const metadata: Metadata = { title: "Home", robots: { index: false } };

async function Greeting() {
  const user = await requirePlayer();
  return (
    <>
      <AppHeader username={user.username} />
      <section className="mx-auto w-full max-w-content px-4 pt-8 sm:px-8 sm:pt-12">
        <h1 className="font-display text-3xl leading-[1.1] font-extrabold tracking-tight">
          Hi, <span className="text-brand">@{user.username}</span>
        </h1>
        <p className="mt-2 text-ink-2">Good to have you at the table.</p>
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

      <main className="mx-auto grid w-full max-w-content gap-6 px-4 py-8 sm:px-8 lg:grid-cols-[1fr_1.4fr]">
        <section
          className="rounded-card border border-line bg-surface p-6 shadow-sm"
          aria-labelledby="join-h"
        >
          <h2 id="join-h" className="text-lg font-bold">
            Got a room code?
          </h2>
          <p className="mt-1 mb-5 text-sm text-ink-2">Type the 6 letters your friend sent you.</p>
          <JoinRoomForm />
        </section>

        <section
          className="rounded-card border border-line bg-surface p-6 shadow-sm"
          aria-labelledby="games-h"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="games-h" className="text-lg font-bold">
              Games
            </h2>
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold">
              Opening soon
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-2">
            We&apos;re setting up the tables. Rooms and quick match open in the next update.
          </p>
          <ul className="mt-5 divide-y divide-line">
            {games.map((g) => (
              <li key={g.slug} className="flex items-center justify-between gap-3 py-3">
                <span className="font-semibold">{g.name}</span>
                <span className="text-sm text-ink-2">{g.players}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
