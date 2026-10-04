import type { ReactNode } from "react";

type ChoiceCardProps = {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
};

/** A large radio option: title, short explanation, optional extra controls when chosen. */
export function ChoiceCard({
  name,
  checked,
  onChange,
  title,
  description,
  icon,
  children,
}: ChoiceCardProps) {
  return (
    <div
      className={`rounded-card border-2 transition-colors duration-(--dur-press) ${checked ? "border-brand bg-brand-soft/40" : "border-line bg-surface hover:border-ink-3"}`}
    >
      <label className="flex cursor-pointer items-start gap-3 p-4 has-focus-visible:outline-2 has-focus-visible:outline-brand">
        <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
        <span
          aria-hidden="true"
          className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${checked ? "border-brand" : "border-ink-3"}`}
        >
          {checked ? <span className="size-2.5 rounded-full bg-brand" /> : null}
        </span>
        {icon ? <span className="shrink-0 text-brand">{icon}</span> : null}
        <span className="min-w-0">
          <span className="block font-semibold">{title}</span>
          {description ? (
            <span className="mt-0.5 block text-sm text-ink-2">{description}</span>
          ) : null}
        </span>
      </label>
      {checked && children ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  );
}
