// Chat and emotes for a room or a tournament lobby (docs/09-chat-moderation.md). Nothing is
// stored: each line is cleaned (links refused, phone numbers masked, insults starred out),
// signed with CHAT_SIGN_SECRET so a report can prove what was said, and sent on. Rate limits and
// the automatic mute live in memory (losing them on hibernation only forgives a little).
import {
  chatSigInput,
  type ChatErrorCode,
  type ChatServerMsg,
  type EmoteId,
  type SignedLine,
} from "@gamehub/protocol";
import { cleanChat } from "@gamehub/protocol/moderation";

const CHAT_GAP_MS = 2000;
const EMOTE_GAP_MS = 2000;
/** 5 starred-out messages in 2 minutes: chat off for 5 minutes here. */
const STRIKES = 5;
const STRIKE_WINDOW_MS = 2 * 60_000;
const AUTO_MUTE_MS = 5 * 60_000;

/** Who's talking (from their ticket). */
export type Talker = {
  userId: string;
  name: string;
  blocked?: readonly string[];
  chatMutedUntil?: number | null;
  publicChat?: boolean;
};

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function hmac(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(text)));
}

export class ChatDesk {
  private lastLine = new Map<string, number>();
  private lastEmote = new Map<string, number>();
  private strikes = new Map<string, number[]>();
  private autoMuted = new Map<string, number>();

  constructor(
    private readonly secret: () => string,
    private readonly roomId: () => string,
  ) {}

  /** Until when this person can't chat here (their account's mute or this room's), or null. */
  mutedUntil(p: Talker, now = Date.now()): number | null {
    const until = Math.max(p.chatMutedUntil ?? 0, this.autoMuted.get(p.userId) ?? 0);
    return until > now ? until : null;
  }

  /** A line from `p`, cleaned and signed, or why not. */
  async line(
    p: Talker,
    raw: string,
  ): Promise<
    { msg: Extract<ChatServerMsg, { t: "chat" }> } | { error: ChatErrorCode; until?: number }
  > {
    const now = Date.now();
    const muted = this.mutedUntil(p, now);
    if (muted) return { error: "MUTED", until: muted };
    if (now - (this.lastLine.get(p.userId) ?? 0) < CHAT_GAP_MS) return { error: "SLOW" };
    const c = cleanChat(raw);
    if (!c.ok) return c.reason === "LINK" ? { error: "LINK" } : { error: "SLOW" };
    this.lastLine.set(p.userId, now);
    if (c.censored) {
      const recent = [...(this.strikes.get(p.userId) ?? []), now].filter(
        (t) => now - t < STRIKE_WINDOW_MS,
      );
      this.strikes.set(p.userId, recent);
      if (recent.length >= STRIKES) this.autoMuted.set(p.userId, now + AUTO_MUTE_MS);
    }
    const sig = await hmac(this.secret(), chatSigInput(this.roomId(), p.userId, now, c.text));
    return {
      msg: {
        t: "chat",
        id: `${now.toString(36)}${p.userId.slice(-4)}`,
        from: { userId: p.userId, name: p.name },
        text: c.text,
        ts: now,
        sig,
      },
    };
  }

  emote(p: Talker, id: EmoteId): Extract<ChatServerMsg, { t: "emote" }> | null {
    const now = Date.now();
    if (now - (this.lastEmote.get(p.userId) ?? 0) < EMOTE_GAP_MS) return null;
    this.lastEmote.set(p.userId, now);
    return { t: "emote", from: { userId: p.userId, name: p.name }, id, ts: now };
  }

  /** The text of a reported line if it really came from `userId` here (our own signature). */
  async verify(line: SignedLine | undefined, userId: string): Promise<string | null> {
    if (!line) return null;
    const sig = await hmac(this.secret(), chatSigInput(this.roomId(), userId, line.ts, line.text));
    return sig === line.sig ? line.text : null;
  }

  /** Whether `viewer` gets chat from `from` (not blocked; public games only if they want it). */
  static delivers(viewer: Talker, from: string, publicGame: boolean): boolean {
    if (viewer.blocked?.includes(from)) return false;
    return !(publicGame && viewer.publicChat === false);
  }
}
