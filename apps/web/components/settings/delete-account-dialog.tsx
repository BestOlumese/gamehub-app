"use client";

import { Alert } from "@gamehub/ui/forms/alert";
import { Button } from "@gamehub/ui/forms/button";
import { Field } from "@gamehub/ui/forms/field";
import { Input } from "@gamehub/ui/forms/input";
import { PasswordInput } from "@gamehub/ui/forms/password-input";
import { Spinner } from "@gamehub/ui/forms/spinner";
import { Dialog } from "@gamehub/ui/overlays/dialog";
import { useState, type FormEvent } from "react";
import { GoogleButton } from "@/components/auth/google-button";
import { authClient, authErrorMessage } from "@/lib/auth-client";

type Props = { username: string; hasPassword: boolean };

/** Password users confirm with their password; Google-only users need a sign-in from the last 10 minutes. */
export function DeleteAccountDialog({ username, hasPassword }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsFreshLogin, setNeedsFreshLogin] = useState(false);
  const confirmed = confirmText.trim().toLowerCase() === username;

  function close() {
    setOpen(false);
    setConfirmText("");
    setError(null);
    setNeedsFreshLogin(false);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirmed) return;
    const password = hasPassword
      ? String(new FormData(e.currentTarget).get("password") ?? "")
      : undefined;
    if (hasPassword && !password) return setError("Enter your password.");
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.deleteUser(password ? { password } : {});
    if (!err) {
      // Full reload: drops any signed-in pages from the client router cache.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/");
      return;
    }
    setBusy(false);
    if (err.code === "SESSION_EXPIRED" || err.code === "SESSION_NOT_FRESH")
      return setNeedsFreshLogin(true);
    setError(authErrorMessage(err));
  }

  return (
    <>
      <Button variant="danger-outline" size="md" onClick={() => setOpen(true)}>
        Delete account…
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title="Delete your account?"
        description="Your account, friends and settings go for good. Games other people played with you will show “Deleted player”. This can't be undone."
      >
        {needsFreshLogin ? (
          <div className="space-y-4">
            <Alert tone="info" title="Log in again first">
              For your safety, deleting your account needs a fresh sign-in. Continue with Google,
              then come back here.
            </Alert>
            <GoogleButton next="/settings/account" label="Sign in again with Google" />
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            {error ? <Alert>{error}</Alert> : null}
            <Field htmlFor="confirm" label={`Type ${username} to confirm`}>
              <Input
                id="confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
              />
            </Field>
            {hasPassword ? (
              <Field htmlFor="delete-password" label="Password">
                <PasswordInput
                  id="delete-password"
                  name="password"
                  autoComplete="current-password"
                />
              </Field>
            ) : null}
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" variant="danger" disabled={!confirmed || busy}>
                {busy ? <Spinner /> : null}
                Delete my account
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
