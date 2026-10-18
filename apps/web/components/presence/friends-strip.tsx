"use client";

import { Avatar } from "@gamehub/ui/data-display/avatar";
import Link from "next/link";
import { usePresence } from "@/lib/presence/store";
import { statusText, watchHref } from "./friends-view";

/** Home: friends who are on now; tap one to watch their game (or see their profile). */
export function FriendsStrip() {
  const friends = usePresence((s) => s.friends);
  const statuses = usePresence((s) => s.statuses);
  const online = friends.filter((f) => statuses[f.id]?.online);
  if (!online.length) return null;
  return (
    <section aria-labelledby="fo-h" className="tile p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="fo-h" className="font-bold">
          Friends online · {online.length}
        </h2>
        <Link href="/friends" className="text-sm font-semibold text-brand-strong hover:underline">
          See all
        </Link>
      </div>
      <ul className="flex gap-4 overflow-x-auto pb-1">
        {online.map((f) => {
          const s = statuses[f.id];
          return (
            <li key={f.id}>
              <Link
                href={watchHref(f, s) ?? `/u/${f.username}`}
                className="flex w-16 flex-col items-center gap-1 text-center text-xs"
              >
                <span className="relative">
                  <Avatar username={f.username} image={f.image} size={44} />
                  <span
                    className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-surface bg-brand"
                    aria-hidden="true"
                  />
                </span>
                <span className="w-full truncate font-semibold">@{f.username}</span>
                <span className="w-full truncate text-ink-2">{statusText(s)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
