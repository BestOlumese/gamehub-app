import { Check } from "lucide-react";

/** Live checklist line under a new-password field. */
export function PasswordRule({ met, children }: { met: boolean; children: string }) {
  return (
    <p
      id="password-msg"
      className={`mt-1.5 flex items-center gap-1.5 text-sm ${met ? "text-brand" : "text-ink-2"}`}
    >
      <span
        className={`flex size-4 items-center justify-center rounded-full border transition-colors duration-(--dur-press) ${met ? "border-brand bg-brand text-white" : "border-ink-3"}`}
        aria-hidden="true"
      >
        {met ? <Check size={11} strokeWidth={3} /> : null}
      </span>
      {children}
      <span className="sr-only">{met ? "(done)" : "(not yet)"}</span>
    </p>
  );
}
