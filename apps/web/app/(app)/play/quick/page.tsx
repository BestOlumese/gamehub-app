import { queueSpecSchema } from "@gamehub/protocol";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { QueueScreen } from "@/components/quick/queue-screen";
import { requirePlayer } from "@/server/session";

export const metadata: Metadata = { title: "Quick match", robots: { index: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Quick({ searchParams }: { searchParams: Search }) {
  await requirePlayer();
  const p = await searchParams;
  const one = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined);
  const tc = one("tc")?.split("+").map(Number);
  const spec = queueSpecSchema.safeParse({
    game: one("g"),
    players: Number(one("n")),
    timeControl: tc && tc.length === 2 ? { baseSeconds: tc[0], incrementSeconds: tc[1] } : null,
    variant: one("v") ?? null,
  });
  if (!spec.success) notFound();
  return <QueueScreen spec={spec.data} />;
}

export default function QuickPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Quick searchParams={searchParams} />
    </Suspense>
  );
}
