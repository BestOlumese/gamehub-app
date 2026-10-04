import { ChevronLeft } from "lucide-react";
import Link from "next/link";

/** Section title. On phones it carries the back link to the settings list. */
export function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-8">
      <Link
        href="/settings"
        className="-ml-1 mb-4 inline-flex items-center gap-1 rounded-control text-sm font-semibold text-brand lg:hidden"
      >
        <ChevronLeft size={18} aria-hidden="true" />
        Settings
      </Link>
      <h2 className="font-display text-2xl leading-[1.15] font-extrabold tracking-tight">
        {title}
      </h2>
      <p className="mt-1 text-ink-2">{description}</p>
    </div>
  );
}
