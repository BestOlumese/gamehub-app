import { ArtImage } from "@/components/site/art-image";
import { games } from "@/lib/games";
import { isPlayable } from "@/lib/playable-games";
import { SectionHeading } from "./section-heading";

export function GamesSection() {
  return (
    <section
      aria-labelledby="games-heading"
      className="mx-auto max-w-content px-4 py-16 sm:px-8 sm:py-20"
    >
      <SectionHeading
        id="games-heading"
        title="Eight games you already know"
        lead="Every rule you argue about is a setting. Start with Naija Standard, then make it yours."
      />
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((g, i) => {
          // Three columns, Whot two wide: the last tile stretches to fill its row.
          const left = (games.length + 1) % 3;
          const last = i === games.length - 1;
          return (
            <li
              key={g.slug}
              className={`overflow-hidden rounded-card border border-line bg-surface shadow-sm ${i === 0 ? "lg:col-span-2" : last && left === 1 ? "lg:col-span-3" : last && left === 2 ? "lg:col-span-2" : ""}`}
            >
              <div className="relative flex h-40 items-center justify-center border-b border-line bg-board">
                <ArtImage name={`game-${g.slug}`} className="h-32 w-auto" lazy />
                {!isPlayable(g.slug) ? (
                  <span className="absolute top-3 right-3 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold">
                    Soon
                  </span>
                ) : null}
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-xl font-bold">{g.name}</h3>
                  <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-brand-strong">
                    {g.players}
                  </span>
                </div>
                <p className="mt-2 text-ink-2">{g.blurb}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
