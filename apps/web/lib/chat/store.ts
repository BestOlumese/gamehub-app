// Chat for whichever room or tournament lobby is open (only one at a time). Nothing is kept
// after the page closes: the last 50 lines live here and nowhere else.
import type { ChatErrorCode, ChatFrom, ChatServerMsg, EmoteId } from "@gamehub/protocol";
import { create } from "zustand";

export type ChatItem =
  | { kind: "line"; key: string; from: ChatFrom; text: string; ts: number; sig: string; at: number }
  | { kind: "emote"; key: string; from: ChatFrom; emote: EmoteId; ts: number; at: number };

type ChatState = {
  items: ChatItem[];
  /** Keys of items still showing as bubbles (3 s each). */
  bubbles: string[];
  /** Lines and emotes since the sheet was last open. */
  unread: number;
  open: boolean;
  /** Muted on this device for this page (Block is the lasting one). */
  hidden: string[];
  mutedUntil: number | null;
  off: boolean;
  error: { code: ChatErrorCode; until?: number; at: number } | null;
  /** Bumped per emote so the dock can play its sound. */
  lastEmote: { emote: EmoteId; n: number } | null;
};

const initial: ChatState = {
  items: [],
  bubbles: [],
  unread: 0,
  open: false,
  hidden: [],
  mutedUntil: null,
  off: false,
  error: null,
  lastEmote: null,
};

const KEEP = 50;
const BUBBLE_MS = 3000;
const ERROR_MS = 4000;

export const useChat = create<ChatState>(() => initial);
export const resetChat = () => useChat.setState(initial, true);

/** Clears the mute when it runs out (setTimeout tops out near 24 days). */
function muteUntil(until: number | null, now: number) {
  if (!until || until <= now) return null;
  const left = until - now;
  if (left < 2 ** 31 - 1)
    setTimeout(() => {
      if (useChat.getState().mutedUntil === until) useChat.setState({ mutedUntil: null });
    }, left);
  return until;
}

/** Applies a chat message; false when `msg` isn't one. */
export function receiveChat(msg: { t: string }, now = Date.now()): boolean {
  const m = msg as ChatServerMsg;
  const s = useChat.getState();
  switch (m.t) {
    case "chat":
    case "emote": {
      if (s.hidden.includes(m.from.userId)) return true;
      const item: ChatItem =
        m.t === "chat"
          ? { kind: "line", key: m.id, from: m.from, text: m.text, ts: m.ts, sig: m.sig, at: now }
          : {
              kind: "emote",
              key: `${m.ts}-${m.from.userId}`,
              from: m.from,
              emote: m.id,
              ts: m.ts,
              at: now,
            };
      setTimeout(
        () =>
          useChat.setState({ bubbles: useChat.getState().bubbles.filter((k) => k !== item.key) }),
        BUBBLE_MS,
      );
      useChat.setState({
        items: [...s.items.slice(-(KEEP - 1)), item],
        bubbles: [...s.bubbles, item.key],
        unread: s.open ? 0 : s.unread + 1,
        ...(m.t === "emote" ? { lastEmote: { emote: m.id, n: (s.lastEmote?.n ?? 0) + 1 } } : {}),
      });
      return true;
    }
    case "chat_state":
      useChat.setState({ mutedUntil: muteUntil(m.mutedUntil, now), off: m.off });
      return true;
    case "chat_error":
      setTimeout(() => {
        if (useChat.getState().error?.at === now) useChat.setState({ error: null });
      }, ERROR_MS);
      useChat.setState({
        error: { code: m.code, ...(m.until ? { until: m.until } : {}), at: now },
        ...(m.code === "MUTED" && m.until ? { mutedUntil: muteUntil(m.until, now) } : {}),
        ...(m.code === "OFF" ? { off: true } : {}),
      });
      return true;
    default:
      return false;
  }
}

/** Hide someone's chat here (and what they already said). */
export function hidePerson(userId: string) {
  const s = useChat.getState();
  useChat.setState({
    hidden: [...s.hidden, userId],
    items: s.items.filter((i) => i.from.userId !== userId),
    bubbles: s.bubbles.filter((k) => s.items.find((i) => i.key === k)?.from.userId !== userId),
  });
}

export const setChatOpen = (open: boolean) =>
  useChat.setState(open ? { open, unread: 0 } : { open });
