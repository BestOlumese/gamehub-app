"use client";

import { Avatar } from "@gamehub/ui/data-display/avatar";
import { ChevronDown, FileText, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { authClient } from "@/lib/auth-client";

type UserMenuProps = { username: string; email: string; image: string | null };

const itemClass =
  "flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-sm font-semibold text-ink outline-none hover:bg-surface-2 focus-visible:bg-surface-2";

export function UserMenu({ username, email, image }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Focus the first item when the menu opens.
  useEffect(() => {
    if (open) root.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [open]);

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const items = [...(root.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const focus = (n: number) => items[(n + items.length) % items.length]?.focus();
    const moves: Record<string, number> = {
      ArrowDown: i + 1,
      ArrowUp: i - 1,
      Home: 0,
      End: items.length - 1,
    };
    const target = moves[e.key];
    if (target !== undefined) {
      e.preventDefault();
      focus(target);
    } else if (e.key === "Escape" || e.key === "Tab") {
      setOpen(false);
      if (e.key === "Escape") trigger.current?.focus();
    }
  }

  async function logOut() {
    setBusy(true);
    await authClient.signOut();
    // Full reload: drops any signed-in pages from the client router cache.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full p-1 pr-2 transition-colors duration-(--dur-press) hover:bg-surface-2 aria-expanded:bg-surface-2"
      >
        <Avatar username={username} image={image} size={34} />
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`text-ink-2 transition-transform duration-(--dur-press) ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKey}
          className="absolute top-full right-0 z-50 mt-2 w-64 origin-top-right rounded-card border border-line bg-surface p-1.5 shadow-lg transition-[opacity,scale] duration-(--dur-sheet) ease-standard starting:scale-95 starting:opacity-0"
        >
          <div className="flex items-center gap-3 px-3 pt-2.5 pb-3">
            <Avatar username={username} image={image} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">@{username}</p>
              <p className="truncate text-sm text-ink-2">{email}</p>
            </div>
          </div>
          <div className="my-1 h-px bg-line" role="separator" />
          <Link
            href="/settings"
            role="menuitem"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            <Settings size={18} aria-hidden="true" className="text-ink-2" />
            Settings
          </Link>
          <Link
            href="/legal/terms"
            role="menuitem"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            <FileText size={18} aria-hidden="true" className="text-ink-2" />
            Terms &amp; privacy
          </Link>
          <div className="my-1 h-px bg-line" role="separator" />
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={logOut}
            disabled={busy}
          >
            <LogOut size={18} aria-hidden="true" className="text-ink-2" />
            {busy ? "Logging out…" : "Log out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
