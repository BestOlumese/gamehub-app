"use client";

import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "@gamehub/protocol/constants";
import { Button } from "@gamehub/ui/forms/button";
import { RoomCodeInput } from "@gamehub/ui/forms/room-code-input";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function JoinRoomForm({ autoFocus }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const complete = code.length === ROOM_CODE_LENGTH;
  const go = (c: string) => router.push(`/r/${c}`);
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
        length={ROOM_CODE_LENGTH}
        autoFocus={autoFocus}
      />
      <Button type="submit" block disabled={!complete}>
        Join room
      </Button>
    </form>
  );
}
