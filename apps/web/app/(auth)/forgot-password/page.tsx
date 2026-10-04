import type { Metadata } from "next";
import { AuthHeading } from "@/components/auth/auth-heading";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell panelLine="It happens." panelSub="We'll sort you out.">
      <AuthHeading
        title="Forgot your password?"
        sub="Enter your email and we'll send you a link to choose a new one."
      />
      <ForgotPasswordForm />
    </AuthShell>
  );
}
