import { LogoMark } from "@gamehub/ui/brand/logo-mark";
import { Wordmark } from "@gamehub/ui/brand/wordmark";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArtImage } from "@/components/site/art-image";

type AuthShellProps = {
  /** Line on the green brand panel (laptop and up). */
  panelLine: string;
  panelSub?: string;
  children: ReactNode;
};

/** Split screen: form on the left, brand panel on the right. Phones get the form only. */
export function AuthShell({ panelLine, panelSub, children }: AuthShellProps) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex min-h-dvh flex-col px-4 sm:px-10">
        <header className="py-5">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-control"
            aria-label="GameHub home"
          >
            <LogoMark className="size-8" />
            <Wordmark className="text-xl" />
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center py-6">
          <div className="w-full max-w-[400px]">{children}</div>
        </main>
        <footer className="flex justify-center gap-5 py-5 text-sm text-ink-2">
          <Link href="/legal/terms" className="hover:text-ink">
            Terms
          </Link>
          <Link href="/legal/privacy" className="hover:text-ink">
            Privacy
          </Link>
        </footer>
      </div>

      <aside className="relative hidden overflow-hidden bg-brand lg:block" aria-hidden="true">
        <div className="absolute inset-0 bg-ankara-brand opacity-50" />
        <div className="absolute inset-0 bg-[radial-gradient(closest-side,var(--color-brand)_55%,transparent)]" />
        <div className="relative flex h-full flex-col justify-center px-14 py-16">
          <ArtImage
            name="hero-table"
            className="mx-auto h-auto w-full max-w-[460px] drop-shadow-[0_24px_40px_rgb(0_0_0/0.25)]"
          />
          <p className="mx-auto mt-6 max-w-[460px] text-center font-display text-3xl leading-[1.15] font-extrabold tracking-tight text-white">
            {panelLine}
          </p>
          {panelSub ? (
            <p className="mx-auto mt-3 max-w-[400px] text-center text-lg text-brand-soft">
              {panelSub}
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
