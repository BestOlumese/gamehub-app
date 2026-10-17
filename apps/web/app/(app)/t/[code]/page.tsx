import { tournamentCodeSchema } from "@gamehub/protocol";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TournamentScreen } from "@/components/tournament/tournament-screen";
import { requirePlayer } from "@/server/session";

export const metadata: Metadata = { title: "Tournament", robots: { index: false } };

async function Tournament({ params }: { params: Promise<{ code: string }> }) {
  await requirePlayer();
  const parsed = tournamentCodeSchema.safeParse((await params).code);
  if (!parsed.success) notFound();
  return <TournamentScreen code={parsed.data} />;
}

export default function TournamentPage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Tournament params={params} />
    </Suspense>
  );
}
