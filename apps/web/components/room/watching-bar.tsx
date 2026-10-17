"use client";

import { Eye } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { GAME_NAMES } from "@/lib/game-meta";
import type { Snapshot } from "@/lib/room/store";

/** For people watching: whose game and which, and a way out. */
export function WatchingBar({ snap }: { snap: Snapshot }) {
  const who = useSearchParams().get("watch");
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-2 text-sm font-semibold">
      <span className="flex min-w-0 items-center gap-2">
        <Eye size={16} aria-hidden="true" className="shrink-0 text-ink-2" />
        <span className="truncate">
          Watching{who ? ` @${who}` : ""} · {GAME_NAMES[snap.room.game]}
        </span>
      </span>
      <Link href="/home" className="shrink-0 text-brand-strong hover:underline">
        Leave
      </Link>
    </div>
  );
}
