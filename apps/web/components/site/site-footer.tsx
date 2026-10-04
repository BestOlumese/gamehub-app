import { LogoMark } from "@gamehub/ui/brand/logo-mark";
import Link from "next/link";
import { AnkaraStrip } from "./ankara-strip";

export function SiteFooter() {
  return (
    <footer className="mt-auto">
      <AnkaraStrip />
      <div className="mx-auto flex max-w-content flex-col gap-4 px-4 py-8 text-sm text-ink-2 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-2">
          <LogoMark className="size-5" />
          <span>GameHub is free to play and for adults 18 and over.</span>
        </div>
        <nav className="flex gap-5">
          <Link href="/legal/terms" className="hover:text-ink">
            Terms
          </Link>
          <Link href="/legal/privacy" className="hover:text-ink">
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
