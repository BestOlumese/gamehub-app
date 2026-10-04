import type { InputHTMLAttributes } from "react";
import { cx } from "../cx";

export const inputClasses =
  "h-12 w-full rounded-control border border-line bg-surface px-4 text-base text-ink " +
  "placeholder:text-ink-3 transition-[border-color,box-shadow] duration-(--dur-press) " +
  "hover:border-ink-3 focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15 " +
  "aria-invalid:border-danger aria-invalid:focus:ring-danger/15 disabled:bg-surface-2 disabled:text-ink-3";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputClasses, className)} {...props} />;
}
