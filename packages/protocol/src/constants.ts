// Plain values only: this module is safe to import from client components
// without pulling in zod. Schemas live in the other modules.

/** Largest WebSocket frame either side accepts (see docs/03-realtime-protocol.md). */
export const MAX_FRAME_BYTES = 4096;

export const CloseCode = {
  Normal: 1000,
  Replaced: 4001,
  Unauthorized: 4003,
  RoomGone: 4004,
  Kicked: 4008,
  RateLimited: 4029,
} as const;
export type CloseCode = (typeof CloseCode)[keyof typeof CloseCode];

/** No I, O, 0 or 1, so codes read clearly when shared aloud or on WhatsApp. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;
