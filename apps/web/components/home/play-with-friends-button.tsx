"use client";

import { Button } from "@gamehub/ui/forms/button";
import dynamic from "next/dynamic";
import { useState } from "react";

// The setup sheet only loads when someone opens it.
const CreateRoomSheet = dynamic(() =>
  import("@/components/create-room/create-room-sheet").then((m) => m.CreateRoomSheet),
);

export function PlayWithFriendsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="md" block onClick={() => setOpen(true)}>
        Play with friends
      </Button>
      {open ? <CreateRoomSheet open={open} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
