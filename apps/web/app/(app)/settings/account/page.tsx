import { Alert } from "@gamehub/ui/forms/alert";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AppHeader } from "@/components/app/app-header";
import { ChangeEmailForm } from "@/components/settings/change-email-form";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { DeleteAccountForm } from "@/components/settings/delete-account-form";
import { SettingsCard } from "@/components/settings/settings-card";
import { signInMethods } from "@/server/accounts";
import { requirePlayer } from "@/server/session";

export const metadata: Metadata = { title: "Account settings", robots: { index: false } };

async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string }>;
}) {
  const [user, query] = await Promise.all([requirePlayer({ fresh: true }), searchParams]);
  const methods = await signInMethods(user.id);
  const hasPassword = methods.has("credential");

  return (
    <>
      <AppHeader username={user.username} />
      <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 sm:px-8 sm:py-12">
        <div>
          <Link href="/home" className="text-sm font-semibold text-brand hover:underline">
            ← Home
          </Link>
          <h1 className="mt-3 font-display text-3xl leading-[1.1] font-extrabold tracking-tight">
            Account
          </h1>
        </div>

        {query.email === "changed" && !query.error ? (
          <Alert tone="success">Your email is now {user.email}.</Alert>
        ) : null}
        {query.error ? (
          <Alert>That link has expired or was already used. Try changing your email again.</Alert>
        ) : null}

        <SettingsCard title="Your details">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-ink-2">Username</dt>
            <dd className="font-semibold">@{user.username}</dd>
            <dt className="text-ink-2">Email</dt>
            <dd className="font-semibold break-all">{user.email}</dd>
            <dt className="text-ink-2">Sign-in</dt>
            <dd className="font-semibold">
              {[hasPassword && "Email and password", methods.has("google") && "Google"]
                .filter(Boolean)
                .join(", ")}
            </dd>
          </dl>
        </SettingsCard>

        {hasPassword ? (
          <SettingsCard title="Change password">
            <ChangePasswordForm />
          </SettingsCard>
        ) : null}

        <SettingsCard
          title="Change email"
          description="We'll send a link to the new address. Nothing changes until you tap it."
        >
          <ChangeEmailForm current={user.email} />
        </SettingsCard>

        <div id="delete">
          <SettingsCard
            title="Delete account"
            tone="danger"
            description="This removes your account, friends and settings for good. Past games other people played with you will show “Deleted player”. This can't be undone."
          >
            <DeleteAccountForm username={user.username} hasPassword={hasPassword} />
          </SettingsCard>
        </div>
      </main>
    </>
  );
}

export default function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string }>;
}) {
  return (
    <div className="min-h-dvh">
      <Suspense fallback={<div className="h-96" aria-busy="true" />}>
        <Settings searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
