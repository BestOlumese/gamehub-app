import { LogoMark } from "@gamehub/ui/brand/logo-mark";
import { Wordmark } from "@gamehub/ui/brand/wordmark";
import Link from "next/link";
import { UserMenu } from "./user-menu";

export type HeaderUser = { username: string; email: string; image?: string | null | undefined };

export function AppHeader({ user }: { user: HeaderUser }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-content items-center justify-between px-4 sm:px-8">
        <Link
          href="/home"
          className="flex items-center gap-2 rounded-control"
          aria-label="GameHub home"
        >
          <LogoMark className="size-8" />
          <Wordmark className="text-xl max-sm:hidden" />
        </Link>
        <UserMenu username={user.username} email={user.email} image={user.image ?? null} />
      </div>
    </header>
  );
}
