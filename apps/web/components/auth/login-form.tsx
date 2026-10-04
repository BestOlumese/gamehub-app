"use client";

import { Alert } from "@gamehub/ui/forms/alert";
import { Button } from "@gamehub/ui/forms/button";
import { Field } from "@gamehub/ui/forms/field";
import { Input } from "@gamehub/ui/forms/input";
import { OrDivider } from "@gamehub/ui/forms/or-divider";
import { PasswordInput } from "@gamehub/ui/forms/password-input";
import { Spinner } from "@gamehub/ui/forms/spinner";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { safeNext } from "@/lib/safe-next";
import { GoogleButton } from "./google-button";

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") === "google" ? "Google sign-in didn't finish. Please try again." : null,
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    if (!email || !password) return setError("Enter your email and password.");

    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signIn.email({ email, password, callbackURL: next });
    if (!err) {
      // Full navigation so the proxy sees the new session cookie.
      window.location.assign(next);
      return;
    }
    setBusy(false);
    if (err.code === "EMAIL_NOT_VERIFIED") {
      router.push(`/verify-email?email=${encodeURIComponent(email)}&from=login`);
      return;
    }
    setError(authErrorMessage(err));
  }

  return (
    <div>
      {googleEnabled ? (
        <>
          <GoogleButton next={next} />
          <div className="my-6">
            <OrDivider label="or log in with email" />
          </div>
        </>
      ) : null}

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
        <Field
          htmlFor="password"
          label="Password"
          aside={
            <Link
              href="/forgot-password"
              className="text-sm font-semibold text-brand hover:underline"
            >
              Forgot password?
            </Link>
          }
        >
          <PasswordInput id="password" name="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" block disabled={busy}>
          {busy ? <Spinner /> : null}
          {busy ? "Logging in" : "Log in"}
        </Button>
      </form>

      <p className="mt-8 text-center text-ink-2">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-brand hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
