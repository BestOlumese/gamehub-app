import type { ReactNode } from "react";

type FieldProps = {
  /** id of the control the label points at. */
  htmlFor: string;
  label: ReactNode;
  /** Shown under the control; replaced by `error` when present. */
  hint?: ReactNode;
  error?: ReactNode;
  /** Right side of the label row, e.g. "Forgot password?". */
  aside?: ReactNode;
  children: ReactNode;
};

/** Label + control + hint/error. Give the control aria-describedby={`${htmlFor}-msg`}. */
export function Field({ htmlFor, label, hint, error, aside, children }: FieldProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p id={`${htmlFor}-msg`} role="alert" className="mt-1.5 text-sm text-danger-strong">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-msg`} className="mt-1.5 text-sm text-ink-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
