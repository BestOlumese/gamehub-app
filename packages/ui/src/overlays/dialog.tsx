"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
};

/**
 * Native <dialog>: focus trap, Escape and inert background for free.
 * Bottom sheet on phones, centred card from `sm` up.
 */
export function Dialog({ open, onClose, title, description, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // click on the backdrop
      }}
      className={
        "fixed inset-x-0 top-auto bottom-0 m-0 max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-[20px] bg-surface p-0 text-ink shadow-lg " +
        "translate-y-0 transition-[translate,opacity,display,overlay] duration-(--dur-sheet) ease-standard transition-discrete " +
        "starting:open:translate-y-full backdrop:bg-ink/40 " +
        "sm:inset-0 sm:m-auto sm:h-fit sm:max-w-md sm:rounded-card sm:starting:open:translate-y-3 sm:starting:open:opacity-0"
      }
    >
      <div className="px-5 pt-3 pb-6 sm:px-6 sm:pt-6">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden="true" />
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-2 flex size-9 items-center justify-center rounded-control text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {description ? (
          <p id={descId} className="mt-1 text-sm text-ink-2">
            {description}
          </p>
        ) : null}
        <div className="mt-5">{open ? children : null}</div>
      </div>
    </dialog>
  );
}
