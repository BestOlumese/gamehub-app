"use client";

import { Alert } from "@gamehub/ui/forms/alert";
import { Button, buttonClasses } from "@gamehub/ui/forms/button";
import { PasswordInput } from "@gamehub/ui/forms/password-input";
import { Spinner } from "@gamehub/ui/forms/spinner";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { PasswordRule } from "./password-rule";

export function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token");
  const linkError = params.get("error");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (linkError || !token) {
    return (
      <div>
        <Alert title="That link didn't work">
          Reset links work once and expire after 1 hour. Ask for a new one and use the newest email.
        </Alert>
        <Link href="/forgot-password" className={buttonClasses("primary", "lg", "mt-6 w-full")}>
          Get a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div>
        <Alert tone="success" title="Password changed">
          You&apos;ve been logged out everywhere else. Log in with your new password.
        </Alert>
        <Link href="/login" className={buttonClasses("primary", "lg", "mt-6 w-full")}>
          Log in
        </Link>
      </div>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.resetPassword({
      newPassword: password,
      token: token ?? "",
    });
    setBusy(false);
    if (err) return setError(authErrorMessage(err));
    setDone(true);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error ? <Alert>{error}</Alert> : null}
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-semibold">
          New password
        </label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="password-msg"
        />
        <PasswordRule met={password.length >= 8}>At least 8 characters</PasswordRule>
      </div>
      <Button type="submit" block disabled={busy}>
        {busy ? <Spinner /> : null}
        Save new password
      </Button>
    </form>
  );
}
