// Tiny generated sounds (no audio files). Created on first use; browsers only let audio
// start after a tap, and by the time a game is running the player has tapped Start or Join.
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

type Tone = {
  f: number;
  at?: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  to?: number;
};

function tones(list: Tone[]) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime;
  for (const { f, at = 0, dur, type = "sine", gain = 0.12, to } of list) {
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t0 + at);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + at + dur);
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(gain, t0 + at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    osc.connect(g).connect(a.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + dur + 0.02);
  }
}

export const sfx = {
  play: () => tones([{ f: 320, dur: 0.07, type: "triangle", gain: 0.16, to: 180 }]),
  market: () => tones([{ f: 900, dur: 0.12, type: "sine", gain: 0.06, to: 400 }]),
  turn: () =>
    tones([
      { f: 660, dur: 0.12, gain: 0.1 },
      { f: 880, at: 0.1, dur: 0.16, gain: 0.1 },
    ]),
  penalty: () =>
    tones([
      { f: 180, dur: 0.16, type: "square", gain: 0.05 },
      { f: 140, at: 0.14, dur: 0.2, type: "square", gain: 0.05 },
    ]),
  special: () =>
    tones([
      { f: 520, dur: 0.08, type: "triangle" },
      { f: 780, at: 0.07, dur: 0.12, type: "triangle" },
    ]),
  lastCard: () => tones([{ f: 988, dur: 0.25, gain: 0.1 }]),
  dice: () =>
    tones(
      [0, 0.07, 0.15, 0.24, 0.34].map((at, i) => ({
        f: 220 + i * 37,
        at,
        dur: 0.05,
        type: "square" as const,
        gain: 0.04,
      })),
    ),
  hop: () => tones([{ f: 600, dur: 0.04, type: "triangle", gain: 0.05 }]),
  capture: () =>
    tones([
      { f: 520, dur: 0.1, type: "square", gain: 0.06, to: 160 },
      { f: 200, at: 0.1, dur: 0.18, type: "triangle", gain: 0.08 },
    ]),
  ladder: () =>
    tones(
      [440, 554, 659, 880].map((f, i) => ({
        f,
        at: i * 0.08,
        dur: 0.12,
        type: "triangle" as const,
        gain: 0.08,
      })),
    ),
  snake: () => tones([{ f: 700, dur: 0.6, type: "sawtooth", gain: 0.04, to: 140 }]),
  // Chess: a wooden "tock" for a move, sharper for a capture.
  move: () => tones([{ f: 180, dur: 0.06, type: "triangle", gain: 0.2, to: 120 }]),
  take: () =>
    tones([
      { f: 260, dur: 0.05, type: "square", gain: 0.06, to: 140 },
      { f: 150, at: 0.04, dur: 0.08, type: "triangle", gain: 0.16 },
    ]),
  castle: () =>
    tones([
      { f: 180, dur: 0.05, type: "triangle", gain: 0.18, to: 120 },
      { f: 200, at: 0.09, dur: 0.05, type: "triangle", gain: 0.18, to: 130 },
    ]),
  check: () =>
    tones([
      { f: 740, dur: 0.09, type: "triangle", gain: 0.08 },
      { f: 988, at: 0.08, dur: 0.14, type: "triangle", gain: 0.08 },
    ]),
  tick: () => tones([{ f: 1400, dur: 0.03, type: "square", gain: 0.03 }]),
  draw: () =>
    tones([
      { f: 523, dur: 0.18, gain: 0.08 },
      { f: 523, at: 0.2, dur: 0.22, gain: 0.08 },
    ]),
  win: () =>
    tones([523, 659, 784, 1047].map((f, i) => ({ f, at: i * 0.11, dur: 0.22, gain: 0.1 }))),
};
