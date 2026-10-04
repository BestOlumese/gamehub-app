"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useRoom } from "@/lib/room/store";

export function RoomTopBar({ code, menu }: { code: string; menu: ReactNode }) {
  const connection = useRoom((s) => s.connection);
  const live = connection === "open";
  return (
    <header className="flex h-14 items-center justify-between gap-2 border-b border-line bg-surface px-2 sm:px-4">
      <Link
        href="/home"
        className="flex items-center gap-1 rounded-control px-2 py-2 text-sm font-semibold text-ink-2 hover:bg-surface-2"
      >
        <ChevronLeft size={18} aria-hidden="true" /> Home
      </Link>
      <div className="flex items-center gap-2 font-display font-bold tracking-[0.15em] tabular-nums">
        <span
          className={`size-2 rounded-full ${live ? "bg-brand" : "bg-accent"}`}
          role="img"
          aria-label={live ? "Connected" : "Reconnecting"}
        />
        {code}
      </div>
      {menu}
    </header>
  );
}
