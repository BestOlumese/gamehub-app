"use client";

import type { TournamentPublic } from "@gamehub/protocol";
import { Button } from "@gamehub/ui/forms/button";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { nameOf, stageTitle } from "@/lib/tournament/labels";

const COUNTDOWN_S = 5;

/** "Your table is ready": who's there, a 5 s countdown, Go now (it goes by itself at 0). */
export function TableReadySheet({
  state,
  you,
  go,
  onStay,
}: {
  state: TournamentPublic;
  you: string;
  go: { table: string; code: string };
  onStay: () => void;
}) {
  const router = useRouter();
  const [left, setLeft] = useState(COUNTDOWN_S);
  const table = state.tables.find((x) => x.id === go.table);
  const byId = new Map(state.entrants.map((e) => [e.id, e]));
  const where = table
    ? `Stage ${table.stage + 1} · ${stageTitle(state, table.stage)} · ${table.seats.length === 2 ? "Match" : `Table ${table.index + 1}`}`
    : "";

  useEffect(() => {
    if (left <= 0) {
      router.push(`/r/${go.code}`);
      return;
    }
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [left, go.code, router]);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-[rgb(0_0_0/0.35)] px-4 pb-4 sm:items-center sm:pb-0">
      <div
        role="dialog"
        aria-labelledby="ready-title"
        className="mx-auto w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-lg transition-[translate,opacity] duration-(--dur-sheet) ease-standard starting:translate-y-full starting:opacity-0"
      >
        <h2 id="ready-title" className="font-display text-2xl font-extrabold tracking-tight">
          Your table is ready
        </h2>
        <p className="mt-1 text-ink-2">{where}</p>
        {table ? (
          <p className="mt-3 text-sm">
            {table.seats.map((id) => (id === you ? "You" : nameOf(byId.get(id)))).join(", ")}
          </p>
        ) : null}
        <Button block className="mt-5" onClick={() => router.push(`/r/${go.code}`)}>
          Go now ({left})
        </Button>
        <button
          type="button"
          onClick={onStay}
          className="mt-2 w-full rounded-control py-2 text-sm font-semibold text-ink-2 hover:bg-surface-2"
        >
          Stay here
        </button>
      </div>
    </div>
  );
}
