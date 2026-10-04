"use client";

import { Alert } from "@gamehub/ui/forms/alert";
import { Button, buttonClasses } from "@gamehub/ui/forms/button";
import { Field } from "@gamehub/ui/forms/field";
import { Input } from "@gamehub/ui/forms/input";
import { Spinner } from "@gamehub/ui/forms/spinner";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArtImage } from "@/components/site/art-image";
import { authClient, authErrorMessage } from "@/lib/auth-client";

const COOLDOWN = 60;
const GMAIL = /@(gmail|googlemail)\.com$/i;

function useCountdown(start: number) {
  const [left, setLeft] = useState(start);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft] as const;
}

export function VerifyEmailView() {
  const params = useSearchParams();
  const linkError = params.get("error");
  const verified = params.get("verified") === "1" && !linkError;
  const [email, setEmail] = useState(params.get("email") ?? "");
  // Just signed up (or tried to log in): a link went out moments ago.
  const [left, setLeft] = useCountdown(
    params.get("sent") === "1" || params.get("from") === "login" ? COOLDOWN : 0,
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  if (verified) {
    return (
      <div>
        <ArtImage name="envelope" className="mb-6 h-auto w-36" />
        <h1 className="font-display text-2xl leading-[1.15] font-extrabold tracking-tight">
          Email confirmed
        </h1>
        <p className="mt-3 text-ink-2">
          You&apos;re in. One last step: pick the name other players will see.
        </p>
        <Link href="/onboarding" className={buttonClasses("primary", "lg", "mt-8 w-full")}>
          Continue
        </Link>
      </div>
    );
  }

  async function resend(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    if (!email) return setNotice({ tone: "error", text: "Enter your email." });
    setBusy(true);
    setNotice(null);
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/verify-email?verified=1",
    });
    setBusy(false);
    if (error) return setNotice({ tone: "error", text: authErrorMessage(error) });
    setLeft(COOLDOWN);
    setNotice({ tone: "success", text: "Sent. The newest link is the one that works." });
  }

  // Expired/used link, or we don't know the address: ask for it.
  if (linkError || !params.get("email")) {
    return (
      <div>
        <h1 className="font-display text-2xl leading-[1.15] font-extrabold tracking-tight">
          {linkError ? "That link didn't work" : "Verify your email"}
        </h1>
        <p className="mt-3 text-ink-2">
          {linkError
            ? "Links work once and expire after 24 hours. Enter your email and we'll send a fresh one."
            : "Enter the email you signed up with and we'll send you a new link."}
        </p>
        <form onSubmit={resend} noValidate className="mt-7 space-y-5">
          {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
          <Field htmlFor="email" label="Email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Button type="submit" block disabled={busy || left > 0}>
            {busy ? <Spinner /> : null}
            {left > 0 ? `Send again in ${left}s` : "Send link"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <ArtImage name="envelope" className="mb-6 h-auto w-36" />
      <h1 className="font-display text-2xl leading-[1.15] font-extrabold tracking-tight">
        Check your email
      </h1>
      <p className="mt-3 text-ink-2">
        {params.get("from") === "login"
          ? "You need to verify your email before you can log in. "
          : null}
        We sent a link to <strong className="font-semibold break-all text-ink">{email}</strong>. Tap
        it to finish setting up your account.
      </p>

      {GMAIL.test(email) ? (
        <a
          href="https://mail.google.com/mail/u/0/#search/from%3AGameHub+in%3Aanywhere"
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses("primary", "lg", "mt-7 w-full")}
        >
          Open Gmail
        </a>
      ) : null}

      <ul className="mt-7 space-y-2 rounded-card border border-line bg-surface p-4 text-sm text-ink-2">
        <li>Can&apos;t see it? Check your Spam or Promotions folder.</li>
        <li>It can take a minute to arrive.</li>
      </ul>

      {notice ? (
        <Alert tone={notice.tone} className="mt-5">
          {notice.text}
        </Alert>
      ) : null}

      <Button
        variant="secondary"
        block
        className="mt-5"
        disabled={busy || left > 0}
        onClick={() => resend()}
      >
        {busy ? <Spinner /> : null}
        {left > 0 ? <span className="tabular-nums">Resend email in {left}s</span> : "Resend email"}
      </Button>

      <p className="mt-8 text-center text-sm text-ink-2">
        Wrong email?{" "}
        <Link href="/signup" className="font-semibold text-brand hover:underline">
          Start again
        </Link>
      </p>
    </div>
  );
}
