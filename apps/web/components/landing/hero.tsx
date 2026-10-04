import { buttonClasses } from "@gamehub/ui/forms/button";
import Link from "next/link";
import { ArtImage } from "@/components/site/art-image";

export function Hero() {
  return (
    <section className="mx-auto grid max-w-content items-center gap-8 px-4 pt-6 pb-12 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-6 lg:pt-14 lg:pb-20">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-sm font-semibold text-ink-2">
          <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
          Free · No download · Any phone
        </p>
        <h1 className="mt-5 font-display text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-[56px]">
          Your games.
          <br />
          Your people.
          <br />
          <span className="text-brand">No wahala.</span>
        </h1>
        <p className="mt-5 max-w-md text-lg text-ink-2">
          Play Whot, Ludo and more with your friends, live in your browser. Make a room, drop the
          link in your WhatsApp group, and play.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/signup" className={buttonClasses("primary", "lg", "sm:px-7")}>
            Play free
          </Link>
          <Link href="/join" className={buttonClasses("secondary", "lg", "sm:px-7")}>
            I have a room code
          </Link>
        </div>
      </div>

      <div className="relative">
        <div
          className="absolute inset-[4%_2%_6%_8%] rounded-[40px] bg-ankara [mask-image:radial-gradient(closest-side,black_55%,transparent)]"
          aria-hidden="true"
        />
        <ArtImage name="hero-table" className="relative mx-auto h-auto w-full max-w-[520px]" />
      </div>
    </section>
  );
}
