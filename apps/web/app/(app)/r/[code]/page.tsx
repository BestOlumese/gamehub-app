import { roomCodeSchema } from "@gamehub/protocol";
import { buttonClasses } from "@gamehub/ui/forms/button";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requirePlayer } from "@/server/session";

export const metadata: Metadata = { title: "Room", robots: { index: false } };

async function Room({ params }: { params: Promise<{ code: string }> }) {
  await requirePlayer();
  const parsed = roomCodeSchema.safeParse((await params).code);
  if (!parsed.success) notFound();
  return (
    <div className="w-full max-w-md rounded-card border border-line bg-surface p-8 text-center shadow-sm">
      <p className="text-sm font-semibold text-ink-2">Room</p>
      <p className="mt-1 font-display text-4xl font-extrabold tracking-[0.2em]">{parsed.data}</p>
      <p className="mt-5 text-ink-2">
        Game rooms open in the next update. Keep this link, it&apos;ll work once they&apos;re live.
      </p>
      <Link href="/home" className={buttonClasses("secondary", "lg", "mt-8 w-full")}>
        Back home
      </Link>
    </div>
  );
}

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Suspense fallback={<div className="h-64 w-full max-w-md" aria-busy="true" />}>
        <Room params={params} />
      </Suspense>
    </main>
  );
}
