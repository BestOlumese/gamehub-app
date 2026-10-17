"use client";

import { useRoom } from "@/lib/room/store";

/** "Rematch" in a room; in quick match the same button finds new players ("Play again"). */
export function RematchLabel() {
  const quick = useRoom((s) => !!s.snap?.room.quick);
  return <>{quick ? "Play again" : "Rematch"}</>;
}
