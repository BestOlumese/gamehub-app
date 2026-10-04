"use client";

import { WifiOff } from "lucide-react";
import { useRoom } from "@/lib/room/store";
import { mmss, useNow } from "./use-now";

const GRACE_MS = 60_000;
const QUIET_MS = 3000; // most blips heal; don't flash a banner for them

export function ConnectionBanner() {
  const connection = useRoom((s) => s.connection);
  const droppedAt = useRoom((s) => s.droppedAt);
  const rtt = useRoom((s) => s.rtt);
  const now = useNow(connection === "reconnecting");

  if (connection === "reconnecting" && droppedAt && now - droppedAt >= QUIET_MS) {
    const left = droppedAt + GRACE_MS - now;
    return (
      <div
        role="status"
        className="flex items-center justify-center gap-2 bg-accent-soft px-4 py-2 text-sm font-semibold"
      >
        <WifiOff size={16} aria-hidden="true" />
        {left > 0
          ? `Reconnecting… your seat is held for ${mmss(left)}`
          : "A bot is playing for you. You'll get your seat back when you reconnect."}
      </div>
    );
  }
  if (connection === "open" && rtt !== null && rtt >= 400) {
    return (
      <div
        role="status"
        className="flex items-center justify-center gap-2 px-4 py-1 text-xs font-semibold text-ink-2"
      >
        <span className="size-2 rounded-full bg-accent" aria-hidden="true" /> Slow network
      </div>
    );
  }
  return null;
}
