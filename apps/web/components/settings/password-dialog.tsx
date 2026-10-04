"use client";

import { Alert } from "@gamehub/ui/forms/alert";
import { Button } from "@gamehub/ui/forms/button";
import { Field } from "@gamehub/ui/forms/field";
import { PasswordInput } from "@gamehub/ui/forms/password-input";
import { Spinner } from "@gamehub/ui/forms/spinner";
import { Dialog } from "@gamehub/ui/overlays/dialog";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PasswordRule } from "@/components/auth/password-rule";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export function PasswordDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function close() {
    setOpen(false);
    setNext("");
    setError(null);
    if (done) router.refresh(); // the devices list just shrank
    setDone(false);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const current = String(new FormData(e.currentTarget).get("current") ?? "");
    if (!current) return setError("Enter your current password.");
    if (next.length < 8) return setError("Use at least 8 characters for the new password.");
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (err) return setError(authErrorMessage(err));
    setDone(true);
  }

  return (
    <>
      <Button variant="secondary" size="md" onClick={() => setOpen(true)}>
        Change
      </Button>
      <Dialog open={open} onClose={close} title="Change password">
        {done ? (
          <div className="space-y-5">
            <Alert tone="success" title="Password changed">
              You&apos;ve been logged out on your other devices.
            </Alert>
            <Button block onClick={close}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            {error ? <Alert>{error}</Alert> : null}
            <Field htmlFor="current" label="Current password">
              <PasswordInput
                id="current"
                name="current"
                autoComplete="current-password"
                required
                autoFocus
              />
            </Field>
            <div>
              <label htmlFor="new-password" className="mb-1.5 block text-sm font-semibold">
                New password
              </label>
              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                minLength={8}
                maxLength={128}
                aria-describedby="password-msg"
              />
              <PasswordRule met={next.length >= 8}>At least 8 characters</PasswordRule>
            </div>
            <Button type="submit" block disabled={busy}>
              {busy ? <Spinner /> : null}
              Save password
            </Button>
          </form>
        )}
      </Dialog>
    </>
  );
}
