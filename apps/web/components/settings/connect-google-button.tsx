"use client";

import { Button } from "@gamehub/ui/forms/button";
import { Spinner } from "@gamehub/ui/forms/spinner";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function ConnectGoogleButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      size="md"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const { error } = await authClient.linkSocial({
          provider: "google",
          callbackURL: "/settings/account?linked=google",
          errorCallbackURL: "/settings/account?linked=failed",
        });
        if (error) setBusy(false);
      }}
    >
      {busy ? <Spinner className="size-4" /> : null}
      Connect
    </Button>
  );
}
