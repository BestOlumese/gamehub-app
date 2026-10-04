import { LogoMark } from "@gamehub/ui/brand/logo-mark";
import { Wordmark } from "@gamehub/ui/brand/wordmark";
import { buttonClasses } from "@gamehub/ui/forms/button";
import { Settings } from "lucide-react";
import Link from "next/link";
import { SignOutButton } from "./sign-out-button";

export function AppHeader({ username }: { username: string }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-content items-center justify-between px-4 py-3 sm:px-8">
        <Link
          href="/home"
          className="flex items-center gap-2 rounded-control"
          aria-label="GameHub home"
        >
          <LogoMark className="size-7" />
          <Wordmark className="text-lg max-sm:hidden" />
        </Link>
        <nav className="flex items-center gap-1">
          <span className="mr-1 max-w-[9rem] truncate text-sm font-semibold text-ink-2">
            @{username}
          </span>
          <Link
            href="/settings/account"
            className={buttonClasses("ghost", "md", "px-3")}
            aria-label="Settings"
          >
            <Settings size={20} aria-hidden="true" />
          </Link>
          <SignOutButton />
        </nav>
      </div>
    </header>
  );
}
