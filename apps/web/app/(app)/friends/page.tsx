import type { Metadata } from "next";
import { Suspense } from "react";
import { AppHeader } from "@/components/app/app-header";
import { PageBanner } from "@/components/app/page-banner";
import { FriendsView } from "@/components/presence/friends-view";
import { friendsOf } from "@/server/friends";
import { requirePlayer } from "@/server/session";

export const metadata: Metadata = { title: "Friends", robots: { index: false } };

async function Friends() {
  const me = await requirePlayer();
  const lists = await friendsOf(me.id);
  return (
    <>
      <AppHeader user={me} />
      <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-8 sm:px-8">
        <PageBanner
          title="Friends"
          sub="Your people, and who's on now."
          tone="ludo"
          art="game-ludo"
        />
        <FriendsView {...lists} />
      </main>
    </>
  );
}

export default function FriendsPage() {
  return (
    <div className="min-h-dvh">
      <Suspense fallback={<div className="h-40" aria-busy="true" />}>
        <Friends />
      </Suspense>
    </div>
  );
}
