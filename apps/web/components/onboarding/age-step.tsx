"use client";

import { Alert } from "@gamehub/ui/forms/alert";
import { Button, buttonClasses } from "@gamehub/ui/forms/button";
import { Spinner } from "@gamehub/ui/forms/spinner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { confirmAge, type AgeResult } from "@/app/(app)/onboarding/actions";
import { DobFields } from "@/components/auth/dob-fields";

export function AgeStep({ currentYear }: { currentYear: number }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<AgeResult | null, FormData>(confirmAge, null);

  useEffect(() => {
    if (state?.status === "ok") router.refresh();
  }, [state, router]);

  if (state?.status === "under18") {
    return (
      <div>
        <h1 className="font-display text-2xl leading-[1.15] font-extrabold tracking-tight">
          GameHub is for adults (18+)
        </h1>
        <p className="mt-3 text-ink-2">
          Sorry, you need to be 18 or older to play. We&apos;ve deleted the account and kept none of
          your details.
        </p>
        <Link href="/" className={buttonClasses("secondary", "lg", "mt-8")}>
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-brand">Step 1 of 2</p>
        <h1 className="mt-1 font-display text-2xl leading-[1.15] font-extrabold tracking-tight">
          One quick check
        </h1>
        <p className="mt-2 text-ink-2">GameHub is for adults. What&apos;s your date of birth?</p>
      </div>
      {state?.status === "error" ? <Alert>{state.message}</Alert> : null}
      <DobFields currentYear={currentYear} />
      <Button type="submit" block disabled={pending}>
        {pending ? <Spinner /> : null}
        Continue
      </Button>
    </form>
  );
}
