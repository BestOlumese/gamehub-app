"use client";

import { useEffect } from "react";
import { connectPresence } from "@/lib/presence/socket";
import { usePresence, type Friend } from "@/lib/presence/store";
import { InviteToasts } from "./invite-toasts";

/**
 * Signed-in pages keep one presence socket: friends' online and in-game status, and invites
 * (shown as toasts on any page). Signed out or not onboarded: nothing happens.
 */
export function PresenceRoot() {
  useEffect(() => {
    let alive = true;
    let ids: string[] = [];
    let conn: ReturnType<typeof connectPresence> | null = null;

    async function load() {
      const res = await fetch("/api/me/friends", { cache: "no-store" }).catch(() => null);
      if (!alive || !res?.ok) return false;
      const { friends, requests } = (await res.json()) as { friends: Friend[]; requests: number };
      ids = friends.map((f) => f.id);
      usePresence.setState({ friends, requests });
      conn?.send({ t: "p_watch", userIds: ids });
      return true;
    }

    void (async () => {
      if (!(await load()) || !alive) return;
      conn = connectPresence(
        (m) => {
          if (m.t === "p_status")
            usePresence.setState((s) => ({ statuses: { ...s.statuses, ...m.statuses } }));
          else if (m.t === "p_update")
            usePresence.setState((s) => ({ statuses: { ...s.statuses, [m.userId]: m.status } }));
          else if (m.t === "p_invite")
            usePresence.setState((s) => ({
              invites: [...s.invites.filter((x) => x.from.id !== m.invite.from.id), m.invite],
            }));
        },
        () => conn?.send({ t: "p_watch", userIds: ids }),
      );
      usePresence.setState({ reload: () => void load() });
    })();
    return () => {
      alive = false;
      conn?.close();
    };
  }, []);
  return <InviteToasts />;
}
