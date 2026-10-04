import { roomCodeSchema } from "@gamehub/protocol";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RoomScreen } from "@/components/room/room-screen";
import { requirePlayer } from "@/server/session";

export const metadata: Metadata = { title: "Room", robots: { index: false } };

async function Room({ params }: { params: Promise<{ code: string }> }) {
  const user = await requirePlayer();
  const parsed = roomCodeSchema.safeParse((await params).code);
  if (!parsed.success) notFound();
  return <RoomScreen code={parsed.data} soundOn={user.soundOn ?? true} />;
}

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Room params={params} />
    </Suspense>
  );
}
