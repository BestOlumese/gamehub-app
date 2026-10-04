"use client";

import { Button } from "@gamehub/ui/forms/button";
import { Spinner } from "@gamehub/ui/forms/spinner";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function LogOutOthersButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      size="md"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await authClient.revokeOtherSessions();
        router.refresh();
        setBusy(false);
      }}
    >
      {busy ? <Spinner className="size-4" /> : null}
      Log out other devices
    </Button>
  );
}
