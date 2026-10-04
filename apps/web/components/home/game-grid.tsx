import { ArtImage } from "@/components/site/art-image";
import { games } from "@/lib/games";
import { isPlayable } from "@/lib/playable-games";
import { PlayWithFriendsButton } from "./play-with-friends-button";

/** Playable games first, then the ones still being built. */
export function GameGrid() {
  const ordered = [...games].sort(
    (a, b) => Number(isPlayable(b.slug)) - Number(isPlayable(a.slug)),
  );
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ordered.map((g) => {
        const playable = isPlayable(g.slug);
        return (
          <li
            key={g.slug}
            className={`flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-sm ${playable ? "" : "opacity-75"}`}
          >
            <div className="relative flex h-36 items-center justify-center border-b border-line bg-board">
              <ArtImage name={`game-${g.slug}`} className="h-28 w-auto" lazy />
              {!playable ? (
                <span className="absolute top-3 right-3 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold">
                  Soon
                </span>
              ) : null}
            </div>
            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-lg font-bold">{g.name}</h3>
                <span className="text-sm whitespace-nowrap text-ink-2">{g.players}</span>
              </div>
              <div className="mt-4">
                {playable ? (
                  <PlayWithFriendsButton />
                ) : (
                  <p className="text-sm text-ink-2">
                    We&apos;re building this table. It opens soon.
                  </p>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
