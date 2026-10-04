import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeading } from "@/components/auth/auth-heading";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { googleSignInEnabled } from "@/lib/google";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <AuthShell panelLine="Your table is waiting." panelSub="Pick up where you left off.">
      <AuthHeading title="Welcome back" sub="Log in to play." />
      <Suspense>
        <LoginForm googleEnabled={googleSignInEnabled} />
      </Suspense>
    </AuthShell>
  );
}
