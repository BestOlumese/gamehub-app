// Chat, emotes and reports, shared by rooms and tournament lobbies (docs/09-chat-moderation.md).
import { z } from "zod";

/** Longest chat line kept (longer ones are cut). */
export const CHAT_MAX = 200;

/** Emotes: a fixed set (voice clips, when recorded, play from /sounds/voice/<id>.webm). */
export const EMOTES = [
  { id: "check_up", label: "Check up!" },
  { id: "go_market", label: "Go market!" },
  { id: "hold_on", label: "Hold on!" },
  { id: "pick_two", label: "Pick two!" },
  { id: "last_card", label: "Last card!" },
  { id: "wahala", label: "Wahala!" },
  { id: "omo", label: "Omo…" },
  { id: "chai", label: "Chai!" },
  { id: "hurry", label: "Abeg hurry" },
  { id: "well_played", label: "Well played" },
  { id: "gg", label: "GG" },
  { id: "lol", label: "LOL" },
] as const;
export type EmoteId = (typeof EMOTES)[number]["id"];
export const emoteIdSchema = z.enum(EMOTES.map((e) => e.id) as [EmoteId, ...EmoteId[]]);

export const REPORT_REASONS = ["abuse", "hate", "sexual", "spam", "cheating", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** A chat line as the server sent it: signed, so a report can prove what was said. */
export const signedLineSchema = z.object({
  text: z.string().max(400),
  ts: z.number().int(),
  sig: z.string().regex(/^[0-9a-f]{64}$/),
});
export type SignedLine = z.infer<typeof signedLineSchema>;

/** What clients may send about chat (added to the room and tournament message unions). */
export const chatClientMsgs = [
  z.object({ t: z.literal("chat"), text: z.string().min(1).max(400) }),
  z.object({ t: z.literal("emote"), id: emoteIdSchema }),
  z.object({
    t: z.literal("report"),
    target: z.string().min(1).max(64),
    reason: z.enum(REPORT_REASONS),
    /** The line being reported, as received (verified by the server's signature). */
    line: signedLineSchema.optional(),
  }),
] as const;

export type ChatFrom = { userId: string; name: string };

export type ChatServerMsg =
  | { t: "chat"; id: string; from: ChatFrom; text: string; ts: number; sig: string }
  | { t: "emote"; from: ChatFrom; id: EmoteId; ts: number }
  /** Your chat right now: muted until (account or this game), or off (host turned it off). */
  | { t: "chat_state"; mutedUntil: number | null; off: boolean }
  | { t: "chat_error"; code: ChatErrorCode; until?: number };

export type ChatErrorCode = "LINK" | "MUTED" | "OFF" | "SLOW" | "REPORTED" | "BAD_REPORT";

/** Room → web (HMAC): a report, with the line only if its signature checked out. */
export const reportRequest = z.object({
  reporterId: z.string().min(1),
  targetId: z.string().min(1),
  roomId: z.string().min(1).max(16),
  reason: z.enum(REPORT_REASONS),
  message: z.string().max(400).nullable(),
});
export type ReportRequest = z.infer<typeof reportRequest>;

/** The text a chat line's signature covers. */
export const chatSigInput = (roomId: string, userId: string, ts: number, text: string) =>
  `${roomId}|${userId}|${ts}|${text}`;
