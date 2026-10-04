import { LogoMark } from "@gamehub/ui/logo-mark";
import { Wordmark } from "@gamehub/ui/wordmark";
import { games } from "@/lib/games";

export default function LandingPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col px-4 sm:px-8">
      <header className="flex items-center gap-2 py-6">
        <LogoMark className="size-8" />
        <Wordmark className="text-xl" />
      </header>

      <main className="flex-1">
        <section className="max-w-2xl pt-10 pb-12 sm:pt-20 sm:pb-16">
          <h1 className="font-display text-3xl leading-[1.15] font-extrabold tracking-tight sm:text-4xl">
            Your games. Your people. No wahala.
          </h1>
          <p className="mt-4 text-lg text-ink-2">
            Whot, Ludo and three more, played live with friends on your phone. Free, no download.
          </p>
          <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent-soft px-4 py-2 text-sm font-semibold">
            <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
            Opening soon
          </p>
        </section>

        <section aria-labelledby="games-heading" className="pb-16">
          <h2
            id="games-heading"
            className="text-sm font-semibold tracking-wide text-ink-2 uppercase"
          >
            The games
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((g) => (
              <li key={g.slug} className="rounded-card border border-line bg-surface p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-display text-xl font-bold">{g.name}</h3>
                  <div className="flex shrink-0 gap-1 pt-2" aria-hidden="true">
                    {g.swatch.map((c, i) => (
                      <span key={i} className={`size-3 rounded-full border border-line ${c}`} />
                    ))}
                  </div>
                </div>
                <p className="mt-1 text-sm font-semibold text-brand">{g.players}</p>
                <p className="mt-3 text-ink-2">{g.blurb}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-line py-6 text-sm text-ink-2">
        GameHub is free to play and for adults 18 and over.
      </footer>
    </div>
  );
}
