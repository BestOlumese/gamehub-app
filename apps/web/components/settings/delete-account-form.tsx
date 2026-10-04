"use client";

import { Alert } from "@gamehub/ui/forms/alert";
import { Button } from "@gamehub/ui/forms/button";
import { Field } from "@gamehub/ui/forms/field";
import { Input } from "@gamehub/ui/forms/input";
import { PasswordInput } from "@gamehub/ui/forms/password-input";
import { Spinner } from "@gamehub/ui/forms/spinner";
import { useState, type FormEvent } from "react";
import { GoogleButton } from "@/components/auth/google-button";
import { authClient, authErrorMessage } from "@/lib/auth-client";

type Props = { username: string; hasPassword: boolean };

/** Password users confirm with their password; Google-only users need a sign-in from the last 10 minutes. */
export function DeleteAccountForm({ username, hasPassword }: Props) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsFreshLogin, setNeedsFreshLogin] = useState(false);
  const confirmed = confirmText.trim().toLowerCase() === username;

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

  if (needsFreshLogin) {
    return (
      <div className="space-y-4">
        <Alert tone="info" title="Log in again first">
          For your safety, deleting your account needs a fresh sign-in. Continue with Google, then
          come back here.
        </Alert>
        <GoogleButton next="/settings/account#delete" label="Sign in again with Google" />
      </div>
    );
  }

  return (
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
        />
      </Field>
      {hasPassword ? (
        <Field htmlFor="delete-password" label="Password">
          <PasswordInput id="delete-password" name="password" autoComplete="current-password" />
        </Field>
      ) : null}
      <Button type="submit" variant="danger" disabled={!confirmed || busy}>
        {busy ? <Spinner /> : null}
        Delete my account
      </Button>
    </form>
  );
}
