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
