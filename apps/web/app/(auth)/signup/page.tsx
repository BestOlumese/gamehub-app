import type { Metadata } from "next";
import { AuthHeading } from "@/components/auth/auth-heading";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupForm } from "@/components/auth/signup-form";
import { googleSignInEnabled } from "@/lib/google";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage() {
  "use cache";
  return (
    <AuthShell
      panelLine="Whot, Ludo and more."
      panelSub="Free to play. No download. Your friends are one link away."
    >
      <AuthHeading title="Create your account" sub="It takes about a minute." />
      <SignupForm googleEnabled={googleSignInEnabled} currentYear={new Date().getFullYear()} />
    </AuthShell>
  );
}
