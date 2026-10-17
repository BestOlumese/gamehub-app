"use client";

import { Button } from "@gamehub/ui/forms/button";
import { Check, MoreHorizontal, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  acceptFriend,
  addFriend,
  blockUser,
  dropRequest,
  removeFriend,
  unblockUser,
  type FriendResult,
} from "@/app/(app)/friends/actions";
import { usePresence } from "@/lib/presence/store";

type Relation = "friends" | "sent" | "received" | "blocked" | "blocked_you" | "none";

/** On a profile: Add friend / Request sent / Accept / Friends ✓, and a ⋯ menu (Remove, Block). */
export function FriendButton({ userId, relation }: { userId: string; relation: Relation }) {
  const router = useRouter();
  const reload = usePresence((s) => s.reload);
  const [menu, setMenu] = useState(false);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<FriendResult>) =>
    start(async () => {
      await fn();
      setMenu(false);
      reload();
      router.refresh();
    });
  return (
    <div className="relative flex items-center gap-2">
      {relation === "friends" ? (
        <span className="inline-flex items-center gap-1.5 rounded-control bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-strong">
          <Check size={16} aria-hidden="true" /> Friends
        </span>
      ) : relation === "sent" ? (
        <Button
          size="md"
          variant="secondary"
          disabled={pending}
          onClick={() => run(() => dropRequest(userId))}
        >
          Request sent · Cancel
        </Button>
      ) : relation === "received" ? (
        <Button size="md" disabled={pending} onClick={() => run(() => acceptFriend(userId))}>
          Accept friend request
        </Button>
      ) : relation === "blocked" ? (
        <Button
          size="md"
          variant="secondary"
          disabled={pending}
          onClick={() => run(() => unblockUser(userId))}
        >
          Unblock
        </Button>
      ) : (
        <Button size="md" disabled={pending} onClick={() => run(() => addFriend({ id: userId }))}>
          <UserPlus size={16} aria-hidden="true" /> Add friend
        </Button>
      )}
      {relation !== "blocked" ? (
        <button
          type="button"
          aria-label="More"
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
          className="grid size-10 place-items-center rounded-control text-ink-2 hover:bg-surface-2"
        >
          <MoreHorizontal size={20} aria-hidden="true" />
        </button>
      ) : null}
      {menu ? (
        <div
          role="menu"
          className="absolute top-full right-0 z-30 mt-1 w-48 rounded-card border border-line bg-surface p-1.5 shadow-lg"
        >
          {relation === "friends" ? (
            <button
              type="button"
              role="menuitem"
              className="w-full rounded-control px-3 py-2 text-left text-sm font-semibold hover:bg-surface-2"
              onClick={() => run(() => removeFriend(userId))}
            >
              Remove friend
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="w-full rounded-control px-3 py-2 text-left text-sm font-semibold text-danger hover:bg-surface-2"
            onClick={() => run(() => blockUser(userId))}
          >
            Block
          </button>
        </div>
      ) : null}
    </div>
  );
}
