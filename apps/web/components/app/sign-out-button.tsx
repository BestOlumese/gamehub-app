"use client";

import { Button, type ButtonVariant } from "@gamehub/ui/forms/button";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ variant = "ghost" }: { variant?: ButtonVariant }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      size="md"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await authClient.signOut();
        // Full reload: drops any signed-in pages from the client router cache.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/");
      }}
    >
      Log out
    </Button>
  );
}
