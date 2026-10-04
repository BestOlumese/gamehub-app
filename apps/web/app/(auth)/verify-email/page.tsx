import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyEmailView } from "@/components/auth/verify-email-view";

export const metadata: Metadata = { title: "Verify your email" };

export default function VerifyEmailPage() {
  return (
    <AuthShell panelLine="Almost there." panelSub="One tap in your inbox and you're in.">
      <Suspense>
        <VerifyEmailView />
      </Suspense>
    </AuthShell>
  );
}
