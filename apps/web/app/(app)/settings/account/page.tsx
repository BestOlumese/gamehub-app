import { Alert } from "@gamehub/ui/forms/alert";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ConnectGoogleButton } from "@/components/settings/connect-google-button";
import { DeleteAccountDialog } from "@/components/settings/delete-account-dialog";
import { EmailDialog } from "@/components/settings/email-dialog";
import { SectionHeader } from "@/components/settings/section-header";
import { SectionSkeleton } from "@/components/settings/section-skeleton";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import { StatusPill } from "@/components/settings/status-pill";
import { googleSignInEnabled } from "@/lib/google";
import { signInMethods } from "@/server/accounts";
import { requirePlayer } from "@/server/session";

export const metadata: Metadata = { title: "Account settings" };

type Query = { email?: string; linked?: string; error?: string };

async function Account({ searchParams }: { searchParams: Promise<Query> }) {
  const [user, query] = await Promise.all([requirePlayer({ fresh: true }), searchParams]);
  const methods = await signInMethods(user.id);
  const hasPassword = methods.has("credential");
  const hasGoogle = methods.has("google");

  return (
    <>
      <SectionHeader title="Account" description="Your email and how you sign in." />

      {query.email === "changed" && !query.error ? (
        <Alert tone="success" className="mb-6">
          Your email is now {user.email}.
        </Alert>
      ) : null}
      {query.error ? (
        <Alert className="mb-6">
          That link has expired or was already used. Try changing your email again.
        </Alert>
      ) : null}
      {query.linked === "google" ? (
        <Alert tone="success" className="mb-6">
          Google is connected. You can now sign in with it too.
        </Alert>
      ) : null}
      {query.linked === "failed" ? (
        <Alert className="mb-6">
          Couldn&apos;t connect Google. The Google account may already belong to another GameHub
          player.
        </Alert>
      ) : null}

      <SettingsGroup title="Email">
        <SettingsRow
          label="Email address"
          value={user.email}
          action={<EmailDialog current={user.email} />}
        />
      </SettingsGroup>

      <SettingsGroup title="Ways to sign in">
        <SettingsRow
          label="Email and password"
          value={
            hasPassword
              ? "Sign in with your email and password."
              : "Not set up. You sign in with Google."
          }
          action={<StatusPill on={hasPassword}>{hasPassword ? "On" : "Off"}</StatusPill>}
        />
        <SettingsRow
          label="Google"
          value={
            hasGoogle
              ? "Sign in with your Google account."
              : "One tap sign-in, no password to remember."
          }
          action={
            hasGoogle ? (
              <StatusPill on>Connected</StatusPill>
            ) : googleSignInEnabled ? (
              <ConnectGoogleButton />
            ) : (
              <StatusPill on={false}>Off</StatusPill>
            )
          }
        />
      </SettingsGroup>

      <section aria-labelledby="danger-h" className="mt-12">
        <h3 id="danger-h" className="mb-2 px-1 text-sm font-semibold text-danger-strong">
          Danger zone
        </h3>
        <div className="flex flex-col gap-4 rounded-card border border-danger/50 bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="font-semibold">Delete account</p>
            <p className="mt-0.5 text-sm text-ink-2">
              Removes your account and everything in it. This can&apos;t be undone.
            </p>
          </div>
          <div className="shrink-0">
            <DeleteAccountDialog username={user.username} hasPassword={hasPassword} />
          </div>
        </div>
      </section>
    </>
  );
}

export default function AccountSettingsPage({ searchParams }: { searchParams: Promise<Query> }) {
  return (
    <Suspense fallback={<SectionSkeleton />}>
      <Account searchParams={searchParams} />
    </Suspense>
  );
}
