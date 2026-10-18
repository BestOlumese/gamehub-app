"use client";

import { Button } from "@gamehub/ui/forms/button";
import { TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { dismissNotice } from "@/app/(app)/home/actions";

/** A moderator's warning, shown on Home until it's acknowledged. */
export function NoticeBanner({ text }: { text: string }) {
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();
  if (gone) return null;
  return (
    <section
      role="status"
      className="flex flex-col gap-3 rounded-card border border-accent bg-accent-soft p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex gap-3">
        <TriangleAlert size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
        <div>
          <h2 className="font-bold">A warning from the moderators</h2>
          <p className="text-sm text-ink-2">{text}</p>
        </div>
      </div>
      <Button
        variant="secondary"
        size="md"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await dismissNotice();
            setGone(true);
          })
        }
      >
        Got it
      </Button>
    </section>
  );
}
