import type { ReactNode } from "react";
import { ArtImage, type ArtName } from "@/components/site/art-image";

export type Tone =
  | "whot"
  | "ludo"
  | "snakes"
  | "tictactoe"
  | "rps"
  | "chess"
  | "draughts"
  | "plots"
  | "football"
  | "trophy";

/**
 * The top of an app page: a tinted, patterned tile with the title and a drawing. With no tone
 * it wears the Ankara repeat (Home); with one, that game's colour and pattern.
 */
export function PageBanner({
  title,
  sub,
  tone,
  art,
  artOnPhones = true,
  lead,
  children,
}: {
  title: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  art?: ArtName;
  /** Long titles (a username) need the width on phones. */
  artOnPhones?: boolean;
  /** Something before the title, like an avatar. */
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      className={`${tone ? `tone-${tone} bg-(--g-soft)` : "bg-paper-2"} relative overflow-hidden rounded-card border border-line shadow-[0_3px_0_var(--color-line-edge)]`}
    >
      {tone ? (
        // Faded behind the title so the words stay easy to read.
        <span
          aria-hidden="true"
          className="absolute inset-0 [mask-image:linear-gradient(100deg,rgb(0_0_0/0.35)_30%,black_75%)]"
        >
          <span className="pat absolute inset-0" />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-ankara opacity-70 [mask-image:linear-gradient(100deg,transparent_35%,black_80%)]"
        />
      )}
      <div className="relative flex items-center justify-between gap-3 px-5 pt-5 pb-6">
        {lead ? <div className="shrink-0">{lead}</div> : null}
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl leading-[1.1] font-extrabold tracking-tight max-sm:text-[28px]">
            {title}
          </h1>
          {sub ? <p className="mt-1 font-semibold text-ink-2">{sub}</p> : null}
          {children}
        </div>
        {art ? (
          <ArtImage
            name={art}
            className={`h-14 w-auto shrink-0 -rotate-6 drop-shadow-sm sm:h-20 ${artOnPhones ? "" : "max-sm:hidden"}`}
          />
        ) : null}
      </div>
      <span
        aria-hidden="true"
        className={`absolute inset-x-0 bottom-0 ${tone ? "h-1.5 bg-(--g)" : "strip"}`}
      />
    </section>
  );
}
