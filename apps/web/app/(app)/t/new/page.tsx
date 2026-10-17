import type { Metadata } from "next";
import { Suspense } from "react";
import { AppHeader } from "@/components/app/app-header";
import { TournamentSetup } from "@/components/tournament/tournament-setup";
import { starterPlan } from "@/lib/tournament/plan";
import { requirePlayer } from "@/server/session";
import { createTournament } from "../actions";

export const metadata: Metadata = { title: "New tournament", robots: { index: false } };

async function NewTournament() {
  const user = await requirePlayer();
  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-xl px-4 py-8 sm:px-8">
        <h1 className="font-display text-3xl leading-[1.1] font-extrabold tracking-tight">
          New tournament
        </h1>
        <p className="mt-1 mb-6 text-ink-2">
          Mix any games in stages. Everyone moves from table to table by themselves.
        </p>
        <TournamentSetup
          initial={{
            name: `${user.username}'s tournament`.slice(0, 40),
            entrants: 8,
            botFill: "medium",
            stages: starterPlan(8),
            autoStart: false,
            spectators: true,
          }}
          submitLabel="Create tournament"
          busyLabel="Making your tournament"
          onSubmit={createTournament}
        />
      </main>
    </>
  );
}

export default function NewTournamentPage() {
  return (
    <div className="min-h-dvh">
      <Suspense fallback={<div className="h-40" aria-busy="true" />}>
        <NewTournament />
      </Suspense>
    </div>
  );
}
