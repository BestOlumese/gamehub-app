"use client";

import { Alert } from "@gamehub/ui/forms/alert";
import { Button } from "@gamehub/ui/forms/button";
import { Field } from "@gamehub/ui/forms/field";
import { Input } from "@gamehub/ui/forms/input";
import { Spinner } from "@gamehub/ui/forms/spinner";
import { Dialog } from "@gamehub/ui/overlays/dialog";
import { useState, type FormEvent } from "react";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export function EmailDialog({ current }: { current: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setError(null);
    setSentTo(null);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const newEmail = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!newEmail) return setError("Enter the new email.");
    if (newEmail.toLowerCase() === current.toLowerCase())
      return setError("That's already your email.");
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.changeEmail({
      newEmail,
      callbackURL: "/settings/account?email=changed",
    });
    setBusy(false);
    if (err) return setError(authErrorMessage(err));
    setSentTo(newEmail);
  }

  return (
    <>
      <Button variant="secondary" size="md" onClick={() => setOpen(true)}>
        Change
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title="Change email"
        description="We'll send a link to the new address. Nothing changes until you tap it."
      >
        {sentTo ? (
          <div className="space-y-5">
            <Alert tone="success" title="Check your new inbox">
              We sent a link to <strong className="break-all text-ink">{sentTo}</strong>. Your email
              changes when you tap it.
            </Alert>
            <Button block onClick={close}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            {error ? <Alert>{error}</Alert> : null}
            <Field htmlFor="new-email" label="New email">
              <Input
                id="new-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                autoFocus
              />
            </Field>
            <Button type="submit" block disabled={busy}>
              {busy ? <Spinner /> : null}
              Send confirmation link
            </Button>
          </form>
        )}
      </Dialog>
    </>
  );
}
