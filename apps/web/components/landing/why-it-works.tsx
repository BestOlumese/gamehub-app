import { Bot, SlidersHorizontal, Smartphone, WifiOff } from "lucide-react";
import { SectionHeading } from "./section-heading";

const points = [
  {
    icon: WifiOff,
    title: "Network drop? Your seat waits.",
    body: "If your connection goes, we hold your seat for 60 seconds. After that a bot plays for you until you're back.",
  },
  {
    icon: Bot,
    title: "No empty chairs",
    body: "Bots on Easy, Medium or Hard fill any seat nobody takes, so the game never stalls.",
  },
  {
    icon: SlidersHorizontal,
    title: "Your house rules",
    body: "Pick 2 stacking, General market, how many cards to deal. Set it once for your room.",
  },
  {
    icon: Smartphone,
    title: "Light on data and phone",
    body: "Nothing to install. It's built to run smoothly on budget Android phones.",
  },
];

export function WhyItWorks() {
  return (
    <section
      aria-labelledby="why-heading"
      className="mx-auto max-w-content px-4 py-16 sm:px-8 sm:py-20"
    >
      <SectionHeading id="why-heading" title="Built for real phones and real networks" />
      <ul className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {points.map((p) => (
          <li key={p.title} className="flex gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-control border border-line bg-surface text-brand">
              <p.icon size={22} aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-lg font-bold">{p.title}</h3>
              <p className="mt-1 text-ink-2">{p.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
