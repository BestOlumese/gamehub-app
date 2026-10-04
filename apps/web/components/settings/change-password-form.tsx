"use client";

import { Alert } from "@gamehub/ui/forms/alert";
import { Button } from "@gamehub/ui/forms/button";
import { Field } from "@gamehub/ui/forms/field";
import { PasswordInput } from "@gamehub/ui/forms/password-input";
import { Spinner } from "@gamehub/ui/forms/spinner";
import { useState, type FormEvent } from "react";
import { PasswordRule } from "@/components/auth/password-rule";
import { authClient, authErrorMessage } from "@/lib/auth-client";

export function ChangePasswordForm() {
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const current = String(new FormData(form).get("current") ?? "");
    if (next.length < 8)
      return setNotice({ tone: "error", text: "Use at least 8 characters for the new password." });
    setBusy(true);
    setNotice(null);
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (error) return setNotice({ tone: "error", text: authErrorMessage(error) });
    form.reset();
    setNext("");
    setNotice({
      tone: "success",
      text: "Password changed. You've been logged out on your other devices.",
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <Field htmlFor="current" label="Current password">
        <PasswordInput id="current" name="current" autoComplete="current-password" required />
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
      <Button type="submit" disabled={busy}>
        {busy ? <Spinner /> : null}
        Change password
      </Button>
    </form>
  );
}
