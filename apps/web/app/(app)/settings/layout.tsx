import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { SettingsHeader } from "@/components/settings/settings-header";
import { SettingsNav } from "@/components/settings/settings-nav";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <Suspense fallback={<div className="h-16 border-b border-line bg-surface" />}>
        <SettingsHeader />
      </Suspense>
      <div className="mx-auto w-full max-w-content px-4 py-8 sm:px-8 sm:py-12 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
        <aside className="hidden lg:block">
          <h1 className="mb-5 px-3 font-display text-2xl font-extrabold tracking-tight">
            Settings
          </h1>
          <SettingsNav variant="sidebar" />
        </aside>
        <main className="max-w-2xl">{children}</main>
      </div>
    </div>
  );
}
