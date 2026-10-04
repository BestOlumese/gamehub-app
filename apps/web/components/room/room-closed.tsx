import { buttonClasses } from "@gamehub/ui/forms/button";
import Link from "next/link";

const GONE = {
  title: "This room has closed",
  body: "The game finished or everyone left a while ago. Start a new one from home.",
};

const copy: Record<number, { title: string; body: string }> = {
  4001: {
    title: "Opened in another tab",
    body: "This game is open somewhere else. Carry on there, or reload this page to play here instead.",
  },
  4004: {
    title: "This room has closed",
    body: "The game finished or everyone left a while ago. Start a new one from home.",
  },
  4008: { title: "You were removed", body: "The host removed you from this room." },
  1000: { title: "You left the game", body: "See you at the next table." },
};

export function RoomClosed({ code }: { code: number }) {
  const c = copy[code] ?? GONE;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <h1 className="font-display text-2xl font-extrabold tracking-tight">{c.title}</h1>
      <p className="mt-3 text-ink-2">{c.body}</p>
      <Link href="/home" className={buttonClasses("primary", "lg", "mt-8")}>
        Back home
      </Link>
    </div>
  );
}
