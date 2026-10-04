"use client";

import { Alert } from "@gamehub/ui/forms/alert";
import { Button } from "@gamehub/ui/forms/button";

/** Keeps the settings sidebar and header up when one section fails. */
export default function SettingsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div>
      <Alert title="This section didn't load">
        Something went wrong on our side. Your account is fine. Try again in a moment.
      </Alert>
      <Button variant="secondary" className="mt-5" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
