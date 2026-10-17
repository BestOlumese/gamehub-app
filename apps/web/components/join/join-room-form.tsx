"use client";

import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  TOURNAMENT_CODE_LENGTH,
} from "@gamehub/protocol/constants";
import { Button } from "@gamehub/ui/forms/button";
import { RoomCodeInput } from "@gamehub/ui/forms/room-code-input";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** One box for both: rooms have 6 letters, tournaments 7. */
export function JoinRoomForm({ autoFocus }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const tournament = code.length === TOURNAMENT_CODE_LENGTH;
  const complete = code.length === ROOM_CODE_LENGTH || tournament;
  const go = (c: string) =>
    router.push(c.length === TOURNAMENT_CODE_LENGTH ? `/t/${c}` : `/r/${c}`);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (complete) go(code);
      }}
      className="space-y-4"
    >
      <RoomCodeInput
        value={code}
        onChange={setCode}
        alphabet={ROOM_CODE_ALPHABET}
        length={TOURNAMENT_CODE_LENGTH}
        autoFocus={autoFocus}
      />
      <Button type="submit" block disabled={!complete}>
        {tournament ? "Join tournament" : "Join room"}
      </Button>
    </form>
  );
}
