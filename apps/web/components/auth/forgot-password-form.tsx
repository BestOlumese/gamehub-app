"use client";

import { Alert } from "@gamehub/ui/forms/alert";
import { Button } from "@gamehub/ui/forms/button";
import { Field } from "@gamehub/ui/forms/field";
import { Input } from "@gamehub/ui/forms/input";
import { Spinner } from "@gamehub/ui/forms/spinner";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { Turnstile } from "./turnstile";

export function ForgotPasswordForm() {
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!email) return setError("Enter your email.");
    if (!token) return setError("One moment, we're checking you're not a robot. Then try again.");
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.requestPasswordReset(
      { email, redirectTo: "/reset-password" },
      { headers: { "x-captcha-response": token } },
    );
    setBusy(false);
    setResetKey((k) => k + 1);
    if (err) return setError(authErrorMessage(err));
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <div>
        <Alert tone="success" title="Check your email">
          If there&apos;s a GameHub account for <strong className="text-ink">{sentTo}</strong>,
          we&apos;ve sent a link to reset the password. It works for 1 hour.
        </Alert>
        <p className="mt-6 text-sm text-ink-2">
          Can&apos;t find it? Check your Spam or Promotions folder.{" "}
          <button
            type="button"
            className="font-semibold text-brand hover:underline"
            onClick={() => setSentTo(null)}
          >
            Try another email
          </button>
        </p>
        <p className="mt-8 text-center text-ink-2">
          <Link href="/login" className="font-semibold text-brand hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {error ? <Alert>{error}</Alert> : null}
      <Field htmlFor="email" label="Email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
        />
      </Field>
      <Turnstile action="forgot-password" onToken={setToken} resetKey={resetKey} />
      <Button type="submit" block disabled={busy}>
        {busy ? <Spinner /> : null}
        Send reset link
      </Button>
      <p className="pt-3 text-center text-ink-2">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
