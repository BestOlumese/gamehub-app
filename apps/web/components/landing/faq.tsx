import Link from "next/link";
import type { ReactNode } from "react";
import { SectionHeading } from "./section-heading";

const faqs: Array<{ q: string; a: ReactNode }> = [
  { q: "Is it really free?", a: "Yes. No coins, no ads, no betting. GameHub is free to play." },
  {
    q: "Do I need to download anything?",
    a: "No. GameHub runs in your phone's browser, so there's nothing to install.",
  },
  {
    q: "Why do I need to be 18?",
    a: "GameHub has chat with people you may not know, so it's for adults only. We ask your date of birth once to check, and we don't keep it.",
  },
  {
    q: "What do you keep about me?",
    a: (
      <>
        Your email, your username and your game results. You can delete your account any time from
        Settings. The full details are in our{" "}
        <Link
          href="/legal/privacy"
          className="font-semibold text-brand underline underline-offset-4"
        >
          privacy policy
        </Link>
        .
      </>
    ),
  },
  {
    q: "Can I play with people I don't know?",
    a: "Yes. Quick match seats you with other players looking for the same game. Only games where everyone is human count towards rankings.",
  },
];

export function Faq() {
  return (
    <section aria-labelledby="faq-heading" className="bg-surface">
      <div className="mx-auto grid max-w-content gap-8 px-4 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1fr_1.6fr]">
        <SectionHeading id="faq-heading" title="Questions people ask" />
        <div className="divide-y divide-line border-y border-line">
          {faqs.map((f) => (
            <details key={f.q} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                {f.q}
                <svg
                  viewBox="0 0 16 16"
                  className="size-4 shrink-0 text-ink-2 transition-transform duration-(--dur-sheet) group-open:rotate-45"
                  aria-hidden="true"
                >
                  <path
                    d="M8 2v12M2 8h12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </summary>
              <p className="pb-5 text-ink-2">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
