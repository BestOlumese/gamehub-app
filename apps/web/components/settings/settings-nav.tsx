"use client";

import { AtSign, ChevronRight, Gamepad2, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export const SETTINGS_SECTIONS = [
  {
    href: "/settings/profile",
    label: "Profile",
    icon: UserRound,
    blurb: "Your username and avatar",
  },
  {
    href: "/settings/account",
    label: "Account",
    icon: AtSign,
    blurb: "Email, sign-in, delete account",
  },
  {
    href: "/settings/security",
    label: "Security",
    icon: ShieldCheck,
    blurb: "Password and devices",
  },
  {
    href: "/settings/preferences",
    label: "Game preferences",
    icon: Gamepad2,
    blurb: "Sound and motion",
  },
] as const;

/** Sidebar on laptops; on phones, the full-width list that /settings opens with. */
export function SettingsNav({ variant }: { variant: "sidebar" | "list" }) {
  const pathname = usePathname();
  // On laptops, bare /settings shows the Profile section.
  const active = pathname === "/settings" ? "/settings/profile" : pathname;

  if (variant === "list") {
    return (
      <nav aria-label="Settings">
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-sm">
          {SETTINGS_SECTIONS.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="flex items-center gap-4 px-4 py-4 hover:bg-surface-2">
                <span className="flex size-10 items-center justify-center rounded-control bg-brand-soft text-brand">
                  <s.icon size={20} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{s.label}</span>
                  <span className="block truncate text-sm text-ink-2">{s.blurb}</span>
                </span>
                <ChevronRight size={18} aria-hidden="true" className="text-ink-2" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Settings">
      <ul className="space-y-1">
        {SETTINGS_SECTIONS.map((s) => {
          const current = active === s.href;
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={current ? "page" : undefined}
                className={`flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-semibold transition-colors duration-(--dur-press) ${
                  current
                    ? "bg-brand-soft text-brand-strong"
                    : "text-ink-2 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <s.icon size={18} aria-hidden="true" />
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
