"use client";

import { GoogleIcon } from "@gamehub/ui/brand/google-icon";
import { Button } from "@gamehub/ui/forms/button";
import { Spinner } from "@gamehub/ui/forms/spinner";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

type GoogleButtonProps = { next?: string; label?: string; highlight?: boolean };

export function GoogleButton({
  next = "/home",
  label = "Continue with Google",
  highlight,
}: GoogleButtonProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      block
      disabled={busy}
      className={highlight ? "ring-3 ring-brand/25" : undefined}
      onClick={async () => {
        setBusy(true);
        const { error } = await authClient.signIn.social({
          provider: "google",
          callbackURL: next,
          newUserCallbackURL: "/onboarding",
          errorCallbackURL: "/login?error=google",
        });
        if (error) setBusy(false);
      }}
    >
      {busy ? <Spinner /> : <GoogleIcon />}
      {label}
    </Button>
  );
}
