import type { FriendStatus, Invite } from "@gamehub/protocol";
import { create } from "zustand";

export type Friend = { id: string; username: string; image: string | null };

type PresenceState = {
  friends: Friend[];
  /** Requests waiting for you (a dot on Friends). */
  requests: number;
  statuses: Record<string, FriendStatus>;
  invites: Invite[];
  /** Reloads the friends list (after adding or removing someone). */
  reload: () => void;
};

export const usePresence = create<PresenceState>(() => ({
  friends: [],
  requests: 0,
  statuses: {},
  invites: [],
  reload: () => {},
}));
