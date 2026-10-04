import { ArtImage } from "@/components/site/art-image";
import { games } from "@/lib/games";
import { SectionHeading } from "./section-heading";

export function GamesSection() {
  return (
    <section
      aria-labelledby="games-heading"
      className="mx-auto max-w-content px-4 py-16 sm:px-8 sm:py-20"
    >
      <SectionHeading
        id="games-heading"
        title="Five games you already know"
        lead="Every rule you argue about is a setting. Start with Naija Standard, then make it yours."
      />
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((g, i) => {
          return (
            <li
              key={g.slug}
              className={`overflow-hidden rounded-card border border-line bg-surface shadow-sm ${i === 0 ? "lg:col-span-2" : ""}`}
            >
              <div className="flex h-40 items-center justify-center border-b border-line bg-board">
                <ArtImage name={`game-${g.slug}`} className="h-32 w-auto" lazy />
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
