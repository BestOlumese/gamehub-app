import type { Metadata } from "next";
import { JoinRoomForm } from "@/components/join/join-room-form";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export const metadata: Metadata = {
  title: "Join a room",
  description: "Enter the 6-letter room code your friend sent you.",
};

export default function JoinPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-start justify-center px-4 pt-10 pb-16 sm:pt-20">
        <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-sm sm:p-8">
          <h1 className="font-display text-2xl leading-[1.15] font-extrabold tracking-tight">
            Join a room
          </h1>
          <p className="mt-2 mb-6 text-ink-2">
            Type the 6-letter code your friend sent you. You&apos;ll log in or sign up next if you
            haven&apos;t.
          </p>
          <JoinRoomForm autoFocus />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
