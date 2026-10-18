"use client";

import { ChevronLeft, Eye } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useRoom } from "@/lib/room/store";

export function RoomTopBar({
  code,
  menu,
  back = { href: "/home", label: "Home" },
}: {
  code: string;
  menu: ReactNode;
  /** A tournament table goes back to its tournament. */
  back?: { href: string; label: string };
}) {
  const connection = useRoom((s) => s.connection);
  const watching = useRoom((s) => s.snap?.room.spectators ?? 0);
  const game = useRoom((s) => s.snap?.room.game);
  const live = connection === "open";
  return (
    <>
      <header className="flex h-14 items-center justify-between gap-2 bg-surface px-2 sm:px-4">
        <Link
          href={back.href}
          className="flex items-center gap-1 rounded-control px-2 py-2 text-sm font-semibold text-ink-2 hover:bg-surface-2"
        >
          <ChevronLeft size={18} aria-hidden="true" /> {back.label}
        </Link>
        <div className="flex items-center gap-2 font-display font-bold tracking-[0.15em] tabular-nums">
          <span
            className={`size-2 rounded-full ${live ? "bg-brand" : "bg-accent"}`}
            role="img"
            aria-label={live ? "Connected" : "Reconnecting"}
          />
          {code}
          {watching ? (
            <span
              className="ml-1 inline-flex items-center gap-1 text-xs font-semibold tracking-normal text-ink-2"
              aria-label={`${watching} watching`}
            >
              <Eye size={14} aria-hidden="true" />
              {watching}
            </span>
          ) : null}
        </div>
        {menu}
      </header>
      {/* The game's colour under the bar (the woven strip until we know the game). */}
      <div aria-hidden="true" className={game ? `tone-${game} h-1.5 bg-(--g)` : "strip"} />
    </>
  );
}
