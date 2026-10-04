import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AgeStep } from "@/components/onboarding/age-step";
import { UsernameStep } from "@/components/onboarding/username-step";
import { signInMethods } from "@/server/accounts";
import { requireUser } from "@/server/session";
import { suggestUsernames } from "@/server/username";

export const metadata: Metadata = { title: "Set up your account", robots: { index: false } };

async function Steps() {
  const user = await requireUser({ fresh: true });
  if (!user.adultConfirmedAt) return <AgeStep currentYear={new Date().getFullYear()} />;
  // Email sign-ups gave their date of birth at sign-up; Google sign-ups just did it as step 1.
  const [methods, suggestions] = await Promise.all([
    signInMethods(user.id),
    suggestUsernames(user.name || user.email),
  ]);
  const viaGoogleOnly = !methods.has("credential");
  return (
    <UsernameStep suggestions={suggestions} stepLabel={viaGoogleOnly ? "Step 2 of 2" : undefined} />
  );
}

export default function OnboardingPage() {
  return (
    <AuthShell panelLine="Last step." panelSub="Pick a name and you're at the table.">
      <Suspense fallback={<div className="h-80" aria-busy="true" />}>
        <Steps />
      </Suspense>
    </AuthShell>
  );
}
