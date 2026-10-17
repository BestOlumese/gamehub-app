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

/** Six boxes for a room code; a link under it switches to seven for a tournament code. */
export function JoinRoomForm({ autoFocus }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [tournament, setTournament] = useState(false);
  const [code, setCode] = useState("");
  const length = tournament ? TOURNAMENT_CODE_LENGTH : ROOM_CODE_LENGTH;
  const complete = code.length === length;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (complete) router.push(`/${tournament ? "t" : "r"}/${code}`);
      }}
      className="space-y-4"
    >
      <RoomCodeInput
        key={length}
        value={code}
        onChange={setCode}
        alphabet={ROOM_CODE_ALPHABET}
        length={length}
        autoFocus={autoFocus}
      />
      <Button type="submit" block disabled={!complete}>
        {tournament ? "Join tournament" : "Join room"}
      </Button>
      <button
        type="button"
        onClick={() => {
          setTournament((t) => !t);
          setCode("");
        }}
        className="w-full rounded-control py-1 text-sm font-semibold text-brand-strong hover:bg-brand-soft"
      >
        {tournament ? "Back to a room code" : "Got a tournament code?"}
      </button>
    </form>
  );
}
