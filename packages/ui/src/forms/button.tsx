import type { ButtonHTMLAttributes } from "react";
import { cx } from "../cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

const base =
  "inline-flex select-none items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap " +
  "transition-[background-color,border-color,transform] duration-(--dur-press) ease-out active:scale-[0.98] " +
  "disabled:pointer-events-none disabled:opacity-60";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong",
  secondary: "border border-line bg-surface text-ink hover:border-ink-3 hover:bg-surface-2",
  ghost: "text-brand hover:bg-brand-soft",
  danger: "bg-danger text-ink hover:brightness-95",
};

const sizes: Record<ButtonSize, string> = {
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

/** Class string for links styled as buttons. */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "lg",
  className?: string,
) {
  return cx(base, variants[variant], sizes[size], className);
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
};

export function Button({
  variant,
  size,
  block,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, cx(block && "w-full", className))}
      {...props}
    />
  );
}
