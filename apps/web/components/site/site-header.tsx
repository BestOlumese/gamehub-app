import { buttonClasses } from "@gamehub/ui/forms/button";
import { LogoMark } from "@gamehub/ui/brand/logo-mark";
import { Wordmark } from "@gamehub/ui/brand/wordmark";
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-content items-center justify-between px-4 py-4 sm:px-8 sm:py-5">
      <Link href="/" className="flex items-center gap-2 rounded-control" aria-label="GameHub home">
        <LogoMark className="size-8" />
        <Wordmark className="text-xl" />
      </Link>
      <nav className="flex items-center gap-1 sm:gap-2">
        <Link href="/login" className={buttonClasses("ghost", "md")}>
          Log in
        </Link>
        <Link href="/signup" className={buttonClasses("primary", "md", "max-sm:hidden")}>
          Play free
        </Link>
      </nav>
    </header>
  );
}
