import { cx } from "../cx";

// Game-piece colours; `ink` text where white would fail contrast.
const COLOURS = [
  { bg: "#D9473A", fg: "#FFFFFF" },
  { bg: "#1F9D5B", fg: "#FFFFFF" },
  { bg: "#E8B021", fg: "#1A1C20" },
  { bg: "#2F6FD6", fg: "#FFFFFF" },
  { bg: "#8E5BD9", fg: "#FFFFFF" },
  { bg: "#E07A2E", fg: "#1A1C20" },
  { bg: "#1AA3A3", fg: "#1A1C20" },
  { bg: "#C2417E", fg: "#FFFFFF" },
] as const;

/** "tunde_o" → "TO", "ada99" → "AD". */
export function initialsFor(username: string): string {
  const [a = username, b] = username.split(/[_\d]+/).filter(Boolean);
  const letters = b ? a.charAt(0) + b.charAt(0) : a.slice(0, 2);
  return letters.toUpperCase();
}

/** Same username, same colour, every time. */
export function colourFor(username: string) {
  let h = 0;
  for (const ch of username) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLOURS[h % COLOURS.length] ?? COLOURS[0];
}

type AvatarProps = {
  username: string;
  /** Google profile photo, when there is one. */
  image?: string | null;
  /** Diameter in px. */
  size?: number;
  className?: string;
};

export function Avatar({ username, image, size = 36, className }: AvatarProps) {
  const base = cx(
    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
    className,
  );
  if (image) {
    return (
      <img
        src={image}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className={cx(base, "bg-surface-2 object-cover")}
      />
    );
  }
  const c = colourFor(username);
  return (
    <span
      aria-hidden="true"
      className={cx(base, "font-display font-bold select-none")}
      style={{
        width: size,
        height: size,
        background: c.bg,
        color: c.fg,
        fontSize: Math.round(size * 0.4),
      }}
    >
      {initialsFor(username)}
    </span>
  );
}
