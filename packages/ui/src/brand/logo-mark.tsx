import type { SVGProps } from "react";

type LogoMarkProps = Omit<SVGProps<SVGSVGElement>, "viewBox" | "children"> & {
  /** Accessible name. Omit when the mark sits next to the wordmark. */
  title?: string;
};

/**
 * Rounded square in four quadrants, one in brand green — a nod to the Ludo board.
 * Drawn on a 32-unit grid so it stays crisp at 16 px.
 */
export function LogoMark({ title, ...props }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path d="M8 0h7v15H0V8a8 8 0 0 1 8-8Z" fill="#1A1C20" />
      <path d="M17 0h7a8 8 0 0 1 8 8v7H17V0Z" fill="#0E7A4E" />
      <path d="M0 17h15v15H8a8 8 0 0 1-8-8v-7Z" fill="#1A1C20" />
      <path d="M17 17h15v7a8 8 0 0 1-8 8h-7V17Z" fill="#1A1C20" />
    </svg>
  );
}
