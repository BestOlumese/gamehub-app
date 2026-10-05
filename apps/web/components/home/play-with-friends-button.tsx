"use client";

import { Button } from "@gamehub/ui/forms/button";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { CreatableGame } from "@/components/create-room/create-room-sheet";

// The setup sheet only loads when someone opens it.
const CreateRoomSheet = dynamic(() =>
  import("@/components/create-room/create-room-sheet").then((m) => m.CreateRoomSheet),
);

export function PlayWithFriendsButton({ game }: { game: CreatableGame }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="md" block onClick={() => setOpen(true)}>
        Play with friends
      </Button>
      {open ? <CreateRoomSheet game={game} open={open} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
