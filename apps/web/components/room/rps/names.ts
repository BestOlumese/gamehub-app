import type { SeatPublic } from "@gamehub/protocol";

export const seatName = (seats: SeatPublic[], i: number | null) => {
  if (i === null) return "Bye";
  const s = seats[i];
  if (!s) return "?";
  return s.userId ? `@${s.name}` : s.name;
};
