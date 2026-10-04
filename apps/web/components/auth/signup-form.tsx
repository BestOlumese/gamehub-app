"use client";

import { Alert } from "@gamehub/ui/forms/alert";
import { buttonClasses, Button } from "@gamehub/ui/forms/button";
import { Field } from "@gamehub/ui/forms/field";
import { Input } from "@gamehub/ui/forms/input";
import { OrDivider } from "@gamehub/ui/forms/or-divider";
import { PasswordInput } from "@gamehub/ui/forms/password-input";
import { Spinner } from "@gamehub/ui/forms/spinner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { DobFields } from "./dob-fields";
import { GoogleButton } from "./google-button";
import { PasswordRule } from "./password-rule";
import { Turnstile } from "./turnstile";

type Props = { googleEnabled: boolean; currentYear: number };

export function SignupForm({ googleEnabled, currentYear }: Props) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{
    field?: "email" | "password" | "dob";
    text: string;
    quota?: boolean;
  } | null>(null);
  const [underAge, setUnderAge] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    if (password.length < 8)
      return setError({ field: "password", text: "Use at least 8 characters." });
    if (!f.get("day") || !f.get("month") || !f.get("year")) {
      return setError({ field: "dob", text: "Enter your date of birth." });
    }
    if (!token)
      return setError({ text: "One moment, we're checking you're not a robot. Then try again." });

    setBusy(true);
    setError(null);
    // Checked by our sign-up hook on the server, then dropped. Not part of Better Auth's typed body.
    const ageCheck = { dob: { day: f.get("day"), month: f.get("month"), year: f.get("year") } };
    const { error: err } = await authClient.signUp.email(
      {
        email,
        password,
        name: email.split("@")[0] ?? "player",
        callbackURL: "/verify-email?verified=1",
        ...ageCheck,
      },
      { headers: { "x-captcha-response": token } },
    );
    if (!err) {
      router.push(`/verify-email?email=${encodeURIComponent(email)}&sent=1`);
      return;
    }
    setBusy(false);
    setResetKey((k) => k + 1);
    if (err.code === "UNDER_18") return setUnderAge(true);
    setError({
      field:
        err.code === "DOB_REQUIRED"
          ? "dob"
          : err.code?.startsWith("PASSWORD")
            ? "password"
            : undefined,
      text: authErrorMessage(err),
      quota: err.code === "EMAIL_QUOTA",
    });
  }

  if (underAge) {
    return (
      <div>
        <h1 className="font-display text-2xl leading-[1.15] font-extrabold tracking-tight">
          GameHub is for adults (18+)
        </h1>
        <p className="mt-3 text-ink-2">
          Sorry, you need to be 18 or older to play. We haven&apos;t created an account or kept any
          of your details.
        </p>
        <Link href="/" className={buttonClasses("secondary", "lg", "mt-8")}>
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div>
      {googleEnabled ? (
        <>
          <GoogleButton next="/home" highlight={error?.quota} />
          <div className="my-6">
            <OrDivider label="or sign up with email" />
          </div>
        </>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {error && !error.field ? <Alert>{error.text}</Alert> : null}

        <Field
          htmlFor="email"
          label="Email"
          error={error?.field === "email" ? error.text : undefined}
        >
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            placeholder="you@example.com"
            aria-describedby="email-msg"
            aria-invalid={error?.field === "email" || undefined}
          />
        </Field>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-semibold">
            Password
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
            aria-invalid={error?.field === "password" || undefined}
          />
          {error?.field === "password" ? (
            <p id="password-msg" role="alert" className="mt-1.5 text-sm text-danger-strong">
              {error.text}
            </p>
          ) : (
            <PasswordRule met={password.length >= 8}>At least 8 characters</PasswordRule>
          )}
        </div>

        <DobFields
          currentYear={currentYear}
          error={error?.field === "dob" ? error.text : undefined}
        />

        <Turnstile action="signup" onToken={setToken} resetKey={resetKey} />

        <Button type="submit" block disabled={busy}>
          {busy ? <Spinner /> : null}
          {busy ? "Creating your account" : "Create account"}
        </Button>

        <p className="text-center text-sm text-ink-2">
          By continuing you agree to our{" "}
          <Link href="/legal/terms" className="font-semibold text-ink underline underline-offset-4">
            Terms
          </Link>{" "}
          and{" "}
          <Link
            href="/legal/privacy"
            className="font-semibold text-ink underline underline-offset-4"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </form>

      <p className="mt-8 text-center text-ink-2">
        Have an account?{" "}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
