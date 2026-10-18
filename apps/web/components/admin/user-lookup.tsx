"use client";

import { Button } from "@gamehub/ui/forms/button";
import { Input } from "@gamehub/ui/forms/input";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moderateAction } from "@/app/(app)/admin/actions";
import { ModButtons } from "./report-card";

type Found = {
  id: string;
  username: string;
  bannedUntil: string | null;
  chatMutedUntil: string | null;
};

/** Find anyone by @username: ban, mute, warn, or lift a ban or mute. */
export function UserLookup({ found, query }: { found: Found | null; query: string }) {
  const router = useRouter();
  const [q, setQ] = useState(query);
  const [pending, start] = useTransition();
  const banned = found?.bannedUntil && new Date(found.bannedUntil) > new Date();
  const muted = found?.chatMutedUntil && new Date(found.chatMutedUntil) > new Date();
  return (
    <section className="space-y-3 tile p-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(`/admin?user=${encodeURIComponent(q.trim())}`);
        }}
      >
        <Input
          aria-label="Find a user"
          placeholder="@username"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="submit">Find</Button>
      </form>
      {query && !found ? <p className="text-sm text-ink-2">Nobody has that username.</p> : null}
      {found ? (
        <div className="space-y-3">
          <p className="font-semibold">
            @{found.username}
            {banned ? " · banned" : ""}
            {muted ? " · chat muted" : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {banned ? (
              <Button
                size="md"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await moderateAction({ action: "unban", targetId: found.id });
                    router.refresh();
                  })
                }
              >
                Unban
              </Button>
            ) : null}
            {muted ? (
              <Button
                size="md"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await moderateAction({ action: "unmute", targetId: found.id });
                    router.refresh();
                  })
                }
              >
                Unmute
              </Button>
            ) : null}
          </div>
          <ModButtons targetId={found.id} />
        </div>
      ) : null}
    </section>
  );
}
