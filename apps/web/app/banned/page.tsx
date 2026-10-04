import type { Metadata } from "next";
import { SignOutButton } from "@/components/app/sign-out-button";
import { contactEmail } from "@/lib/contact";

export const metadata: Metadata = { title: "Account suspended", robots: { index: false } };

export default function BannedPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="font-display text-2xl leading-[1.15] font-extrabold tracking-tight">
          Your account is suspended
        </h1>
        <p className="mt-3 text-ink-2">
          A moderator suspended this account for breaking the rules. If you think this is a mistake,
          email {contactEmail} from the address on your account.
        </p>
        <div className="mt-8 flex justify-center">
          <SignOutButton variant="secondary" />
        </div>
      </div>
    </main>
  );
}
