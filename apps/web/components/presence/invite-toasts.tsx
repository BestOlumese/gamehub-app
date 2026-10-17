"use client";

import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Button } from "@gamehub/ui/forms/button";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GAME_NAMES } from "@/lib/game-meta";
import { usePresence } from "@/lib/presence/store";

/** "@ada invites you to Whot" on any page, with Join and Not now, until it expires (2 min). */
export function InviteToasts() {
  const router = useRouter();
  const invites = usePresence((s) => s.invites);
  // The clock starts on the phone (never during prerender).
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!invites.length) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [invites.length]);
  const live = invites.filter((i) => i.expiresAt > now);
  const drop = (id: string) =>
    usePresence.setState((s) => ({ invites: s.invites.filter((x) => x.id !== id) }));
  if (!live.length) return null;
  return (
    <div
      className="fixed inset-x-0 top-2 z-[60] flex flex-col items-center gap-2 px-3"
      aria-live="polite"
    >
      {live.map((i) => {
        const left = now ? Math.max(0, Math.ceil((i.expiresAt - now) / 1000)) : 120;
        const what =
          i.kind === "tournament"
            ? `the tournament "${i.name ?? ""}"`
            : i.game
              ? GAME_NAMES[i.game]
              : "a game";
        return (
          <div
            key={i.id}
            role="alert"
            className="w-full max-w-md rounded-card border border-line bg-surface p-4 shadow-lg transition-[translate,opacity] duration-(--dur-sheet) ease-standard starting:-translate-y-4 starting:opacity-0"
          >
            <div className="flex items-center gap-3">
              <Avatar username={i.from.name} image={i.from.avatar} size={40} />
              <p className="min-w-0 flex-1 text-sm">
                <span className="font-bold">@{i.from.name}</span> invites you to {what}
              </p>
              <span className="text-xs text-ink-2 tabular-nums">
                {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                size="md"
                onClick={() => {
                  drop(i.id);
                  router.push(`/${i.kind === "tournament" ? "t" : "r"}/${i.code}`);
                }}
              >
                Join
              </Button>
              <Button size="md" variant="secondary" onClick={() => drop(i.id)}>
                Not now
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
