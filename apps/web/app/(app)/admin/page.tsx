import type { Metadata } from "next";
import { Suspense } from "react";
import { AppHeader } from "@/components/app/app-header";
import { ReportCard } from "@/components/admin/report-card";
import { UserLookup } from "@/components/admin/user-lookup";
import { findUser, openReports, requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

type Search = Promise<Record<string, string | string[] | undefined>>;

async function Admin({ searchParams }: { searchParams: Search }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const query = typeof sp.user === "string" ? sp.user : "";
  const [queue, found] = await Promise.all([openReports(), query ? findUser(query) : null]);
  // Dates cross to client components as strings.
  const plain = JSON.parse(JSON.stringify(queue)) as Parameters<typeof ReportCard>[0]["r"][];
  return (
    <>
      <AppHeader user={me} />
      <main className="mx-auto w-full max-w-2xl space-y-5 px-4 py-8 sm:px-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">
          Reports · {queue.length} open
        </h1>
        <UserLookup query={query} found={found ? JSON.parse(JSON.stringify(found)) : null} />
        {plain.length ? (
          <ul className="space-y-3">
            {plain.map((r) => (
              <ReportCard key={r.id} r={r} />
            ))}
          </ul>
        ) : (
          <p className="tile p-4 text-ink-2">Nothing to review.</p>
        )}
      </main>
    </>
  );
}

export default function AdminPage({ searchParams }: { searchParams: Search }) {
  return (
    <div className="min-h-dvh">
      <Suspense fallback={<div className="h-40" aria-busy="true" />}>
        <Admin searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
