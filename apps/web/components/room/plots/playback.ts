// Plays a burst of Naija Plots events at human speed: dice tumble, the token hops square by
// square, a pause on cards. Like Snakes, the board starts from the position before the burst.

type Event = { type: string } & Record<string, unknown>;

export const DICE_MS = 900;
export const HOP_MS = 90;
const SETTLE_MS = 250;
const CARD_MS = 1400;
const SPACES = 40;

export type PlotsPlaybackHooks = {
  /** Token squares as they should look now (null: show the latest snapshot). */
  board(pos: number[] | null): void;
  dice(d: { seat: number; dice: [number, number]; key: number } | null): void;
  event(e: Event): void;
  hop(): void;
  wait(ms: number, fn: () => void): void;
};

/** The squares a token passes through, ending where it lands (backwards for "move back"). */
export function hopPath(from: number, steps: number): number[] {
  const out: number[] = [];
  const dir = steps < 0 ? -1 : 1;
  for (let i = 1; i <= Math.abs(steps); i++)
    out.push((((from + dir * i) % SPACES) + SPACES) % SPACES);
  return out;
}

export class PlotsPlayback {
  private queue: Event[] = [];
  private pos: number[] | null = null;
  private running = false;
  private rolls = 0;

  constructor(
    private hooks: PlotsPlaybackHooks,
    private reduce = false,
  ) {}

  get busy() {
    return this.running;
  }

  push(events: Event[], before: number[] | undefined) {
    this.queue.push(...events);
    if (this.running || !this.queue.length) return;
    this.running = true;
    this.pos = before ? [...before] : null;
    this.hooks.board(this.pos ? [...this.pos] : null);
    this.next();
  }

  private set(seat: number, square: number) {
    if (this.pos) this.pos[seat] = square;
    this.hooks.board(this.pos ? [...this.pos] : null);
  }

  private next(): void {
    const e = this.queue.shift();
    if (!e) {
      this.running = false;
      this.pos = null;
      this.hooks.board(null);
      return;
    }
    const seat = Number(e.seat);
    switch (e.type) {
      case "rolled":
        this.hooks.dice({ seat, dice: e.dice as [number, number], key: ++this.rolls });
        this.hooks.event(e);
        return this.hooks.wait(this.reduce ? 250 : DICE_MS, () => this.next());
      case "moved": {
        const path = hopPath(Number(e.from), Number(e.steps));
        const hops = this.reduce ? path.slice(-1) : path;
        this.hooks.event(e);
        hops.forEach((sq, i) =>
          this.hooks.wait(i * HOP_MS, () => {
            this.set(seat, sq);
            this.hooks.hop();
          }),
        );
        return this.hooks.wait(hops.length * HOP_MS + SETTLE_MS, () => this.next());
      }
      case "police":
        this.hooks.event(e);
        return this.hooks.wait(this.reduce ? 0 : 400, () => {
          this.set(seat, 10);
          this.next();
        });
      case "card":
        this.hooks.event(e);
        return this.hooks.wait(this.reduce ? 300 : CARD_MS, () => this.next());
      default:
        this.hooks.event(e);
        return this.next();
    }
  }
}
