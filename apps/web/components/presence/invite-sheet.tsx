"use client";

import type { GameSlug } from "@gamehub/engine";
import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Button } from "@gamehub/ui/forms/button";
import { Dialog } from "@gamehub/ui/overlays/dialog";
import { UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { inviteFriend } from "@/app/(app)/friends/actions";
import { usePresence } from "@/lib/presence/store";
import { statusText } from "./friends-view";

/** "Invite friends" in a lobby: friends with their status and an Invite button each. */
export function InviteFriendsButton({
  kind,
  code,
  game,
  name,
  exclude = [],
}: {
  kind: "room" | "tournament";
  code: string;
  game: GameSlug | null;
  name: string | null;
  /** Already here (no point inviting them). */
  exclude?: string[];
}) {
  const [open, setOpen] = useState(false);
  const friends = usePresence((s) => s.friends).filter((f) => !exclude.includes(f.id));
  const statuses = usePresence((s) => s.statuses);
  const [sent, setSent] = useState<Record<string, string>>({});
  const sorted = [...friends].sort(
    (a, b) => Number(!!statuses[b.id]?.online) - Number(!!statuses[a.id]?.online),
  );
  return (
    <>
      <Button variant="secondary" block onClick={() => setOpen(true)}>
        <UserPlus size={18} aria-hidden="true" /> Invite friends
      </Button>
      {open ? (
        <Dialog open onClose={() => setOpen(false)} title="Invite friends">
          {sorted.length ? (
            <ul className="divide-y divide-line rounded-card border border-line">
              {sorted.map((f) => {
                const on = !!statuses[f.id]?.online;
                return (
                  <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                    <Avatar username={f.username} image={f.image} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">@{f.username}</span>
                      <span className={`text-sm ${on ? "text-brand-strong" : "text-ink-2"}`}>
                        {sent[f.id] ?? statusText(statuses[f.id])}
                      </span>
                    </span>
                    <Button
                      size="md"
                      disabled={!on || !!sent[f.id]}
                      onClick={async () => {
                        setSent((s) => ({ ...s, [f.id]: "Sending…" }));
                        const r = await inviteFriend({ to: f.id, kind, code, game, name });
                        setSent((s) => ({
                          ...s,
                          [f.id]: r.message ?? (r.ok ? "Invite sent." : ""),
                        }));
                      }}
                    >
                      Invite
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">
              No friends yet.{" "}
              <Link href="/friends" className="font-semibold text-brand-strong underline">
                Add some
              </Link>{" "}
              by their @username.
            </p>
          )}
        </Dialog>
      ) : null}
    </>
  );
}
