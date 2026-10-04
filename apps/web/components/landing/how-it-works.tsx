import { Dices, Share2, SquarePlus } from "lucide-react";
import { SectionHeading } from "./section-heading";

const steps = [
  {
    icon: SquarePlus,
    title: "Make a room",
    body: "Pick a game and your house rules. You get a 6-letter room code.",
  },
  {
    icon: Share2,
    title: "Share the link",
    body: "Send it to your WhatsApp group. Friends join in two taps.",
  },
  {
    icon: Dices,
    title: "Play",
    body: "Not enough people? Bots fill the empty seats and you start anyway.",
  },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="how-heading" className="bg-surface">
      <div className="mx-auto max-w-content px-4 py-16 sm:px-8 sm:py-20">
        <SectionHeading id="how-heading" title="From group chat to game in a minute" />
        <ol className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-6">
          {steps.map((s, i) => (
            <li key={s.title} className="relative">
              <div className="flex items-center gap-3">
                <span className="flex size-12 items-center justify-center rounded-card bg-brand-soft text-brand">
                  <s.icon size={24} aria-hidden="true" />
                </span>
                <span className="font-display text-sm font-bold text-ink-2 tabular-nums">
                  0{i + 1}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
              <p className="mt-1 text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
