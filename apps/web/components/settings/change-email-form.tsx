"use client";

import { Alert } from "@gamehub/ui/forms/alert";
import { Button } from "@gamehub/ui/forms/button";
import { Field } from "@gamehub/ui/forms/field";
import { Input } from "@gamehub/ui/forms/input";
import { Spinner } from "@gamehub/ui/forms/spinner";
import { useState, type FormEvent } from "react";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export function ChangeEmailForm({ current }: { current: string }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const newEmail = String(new FormData(form).get("email") ?? "").trim();
    if (!newEmail) return setNotice({ tone: "error", text: "Enter the new email." });
    if (newEmail.toLowerCase() === current.toLowerCase()) {
      return setNotice({ tone: "error", text: "That's already your email." });
    }
    setBusy(true);
    setNotice(null);
    const { error } = await authClient.changeEmail({
      newEmail,
      callbackURL: "/settings/account?email=changed",
    });
    setBusy(false);
    if (error) return setNotice({ tone: "error", text: authErrorMessage(error) });
    form.reset();
    setNotice({
      tone: "success",
      text: `We sent a link to ${newEmail}. Your email changes when you tap it.`,
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <Field htmlFor="new-email" label="New email">
        <Input
          id="new-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
        />
      </Field>
      <Button type="submit" variant="secondary" disabled={busy}>
        {busy ? <Spinner /> : null}
        Send confirmation link
      </Button>
    </form>
  );
}
