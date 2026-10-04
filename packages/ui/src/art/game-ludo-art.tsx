import { LudoBoardArt } from "./ludo-board-art";

export function GameLudoArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 110" className={className} aria-hidden="true">
      <g transform="translate(37 6) scale(0.65)">
        <LudoBoardArt />
      </g>
    </svg>
  );
}
