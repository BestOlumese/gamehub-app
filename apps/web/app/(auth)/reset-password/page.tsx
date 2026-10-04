import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeading } from "@/components/auth/auth-heading";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <AuthShell panelLine="Fresh start." panelSub="Choose a password you'll remember.">
      <AuthHeading title="Choose a new password" />
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
