import { ArtImage } from "@/components/site/art-image";
import { games } from "@/lib/games";
import { isPlayable } from "@/lib/playable-games";
import { PlayWithFriendsButton } from "./play-with-friends-button";
import { QuickMatchButton } from "./quick-match-button";

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
            className={`tone-${g.slug} tile flex flex-col overflow-hidden ${playable ? "" : "opacity-75"}`}
          >
            <div className="relative flex h-36 items-center justify-center border-b-4 border-(--g) bg-(--g-soft)">
              <span aria-hidden="true" className="pat absolute inset-0" />
              <ArtImage
                name={`game-${g.slug}`}
                className="relative h-28 w-auto drop-shadow-[0_4px_0_rgb(0_0_0/0.08)]"
                lazy
              />
              {!playable ? (
                <span className="absolute top-3 right-3 rounded-full bg-surface px-2.5 py-0.5 text-xs font-bold">
                  Soon
                </span>
              ) : null}
            </div>
            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-xl font-extrabold tracking-tight">{g.name}</h3>
                <span className="rounded-full bg-(--g-soft) px-2.5 py-0.5 text-xs font-bold whitespace-nowrap text-(--g)">
                  {g.players}
                </span>
              </div>
              <div className="mt-4">
                {isPlayable(g.slug) ? (
                  <div className="grid gap-2">
                    <PlayWithFriendsButton game={g.slug} />
                    <QuickMatchButton game={g.slug} />
                  </div>
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
