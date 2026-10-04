import { buttonClasses } from "@gamehub/ui/forms/button";
import Link from "next/link";

export function FinalCta() {
  return (
    <section className="mx-auto max-w-content px-4 py-16 text-center sm:px-8 sm:py-20">
      <h2 className="font-display text-3xl leading-[1.1] font-extrabold tracking-tight sm:text-4xl">
        Your table is waiting.
      </h2>
      <p className="mx-auto mt-3 max-w-md text-lg text-ink-2">
        Sign up in a minute with Google or your email.
      </p>
      <Link href="/signup" className={buttonClasses("primary", "lg", "mt-8 px-8")}>
        Play free
      </Link>
    </section>
  );
}
