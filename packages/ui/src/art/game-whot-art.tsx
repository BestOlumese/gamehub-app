import { WhotCardArt } from "./whot-card-art";
import { WhotCardBackArt } from "./whot-card-back-art";

export function GameWhotArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 110" className={className} aria-hidden="true">
      <g transform="translate(36 14) rotate(-12 30 44)">
        <WhotCardBackArt />
      </g>
      <g transform="translate(66 10) rotate(9 30 44)">
        <WhotCardArt shape="star" number={20} />
      </g>
    </svg>
  );
}
