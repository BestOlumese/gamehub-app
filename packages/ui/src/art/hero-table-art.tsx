import { DieArt } from "./die-art";
import { LudoBoardArt } from "./ludo-board-art";
import { SeedArt } from "./seed-art";
import { WhotCardArt } from "./whot-card-art";
import { WhotCardBackArt } from "./whot-card-back-art";

/** Landing hero: a corner of the table mid-game. Decorative. */
export function HeroTableArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 520 420" className={className} aria-hidden="true">
      <defs>
        <filter id="hero-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#1A1C20" floodOpacity="0.12" />
        </filter>
        <filter id="hero-shadow-sm" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#1A1C20" floodOpacity="0.14" />
        </filter>
      </defs>

      {/* Ludo board, tilted, back right */}
      <g transform="translate(250 70) rotate(9 115 115) scale(1.55)" filter="url(#hero-shadow)">
        <LudoBoardArt />
      </g>

      {/* Market pile and a played card */}
      <g transform="translate(150 40) rotate(-8)" filter="url(#hero-shadow-sm)">
        <WhotCardBackArt />
      </g>
      <g transform="translate(156 36) rotate(-3)" filter="url(#hero-shadow-sm)">
        <WhotCardBackArt />
      </g>

      {/* Hand of Whot cards, fanned from a point below */}
      <g transform="translate(40 150)">
        {(
          [
            { shape: "circle", number: 5, angle: -24 },
            { shape: "triangle", number: 14, angle: -9 },
            { shape: "cross", number: 2, angle: 6 },
            { shape: "star", number: 7, angle: 21 },
          ] as const
        ).map((c) => (
          <g
            key={c.number}
            transform={`rotate(${c.angle} 90 250) translate(60 70)`}
            filter="url(#hero-shadow-sm)"
          >
            <g transform="scale(1.35)">
              <WhotCardArt shape={c.shape} number={c.number} />
            </g>
          </g>
        ))}
      </g>

      {/* Dice and seeds, front */}
      <g transform="translate(210 318) rotate(-14)" filter="url(#hero-shadow-sm)">
        <g transform="scale(1.3)">
          <DieArt value={6} />
        </g>
      </g>
      <g transform="translate(276 336) rotate(11)" filter="url(#hero-shadow-sm)">
        <g transform="scale(1.3)">
          <DieArt value={6} />
        </g>
      </g>
      <g transform="translate(360 330) scale(1.5)">
        <SeedArt color="#1F9D5B" />
      </g>
      <g transform="translate(398 344) scale(1.5)">
        <SeedArt color="#D9473A" />
      </g>
    </svg>
  );
}
