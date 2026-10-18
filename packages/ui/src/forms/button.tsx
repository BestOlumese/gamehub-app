import type { ButtonHTMLAttributes } from "react";
import { cx } from "../cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-outline";
export type ButtonSize = "md" | "lg";

const base =
  "inline-flex select-none items-center justify-center gap-2 rounded-control font-bold whitespace-nowrap " +
  "transition-[background-color,border-color,translate,box-shadow] duration-(--dur-press) ease-out " +
  "disabled:pointer-events-none disabled:opacity-60";

const variants: Record<ButtonVariant, string> = {
  // Chunky, like a game piece: a solid edge underneath that the button sinks into when pressed.
  primary:
    "bg-brand text-white shadow-[0_4px_0_var(--color-brand-strong)] hover:brightness-110 " +
    "active:translate-y-[3px] active:shadow-[0_1px_0_var(--color-brand-strong)]",
  secondary:
    "border border-line bg-surface text-ink shadow-[0_3px_0_var(--color-line-edge)] hover:bg-paper " +
    "active:translate-y-[2px] active:shadow-[0_1px_0_var(--color-line-edge)]",
  ghost: "text-brand hover:bg-brand-soft active:translate-y-px",
  danger:
    "bg-danger text-ink shadow-[0_4px_0_var(--color-danger-strong)] hover:brightness-105 " +
    "active:translate-y-[3px] active:shadow-[0_1px_0_var(--color-danger-strong)]",
  /** Opens a destructive flow without being the final, irreversible click. */
  "danger-outline":
    "border border-danger/60 bg-surface text-danger-strong shadow-[0_3px_0_var(--color-danger-soft)] " +
    "hover:bg-danger-soft active:translate-y-[2px] active:shadow-none",
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
