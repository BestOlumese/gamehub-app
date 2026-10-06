import { HOP_MS, ROLL_SHOW_MS, SETTLE_MS } from "@gamehub/engine/ludo";

type Event = { type: string } & Record<string, unknown>;

export type PlaybackHooks = {
  /** The board as it should look right now (null: show the latest snapshot). */
  board(seeds: number[][] | null): void;
  /** Whose turn is being played back (null when idle). */
  actor(seat: number | null): void;
  /** An event "happens" on screen now: show its die, message or sound. */
  event(e: Event): void;
  /** One hop of a moving seed. */
  hop(): void;
  wait(ms: number, fn: () => void): void;
};

const copy = (seeds: number[][]) => seeds.map((s) => [...s]);

/**
 * Plays a burst of Ludo events at human speed. The server applies a whole turn at once
 * (roll, move, bonus roll…) and sends its snapshot straight after the events, so the
 * board shown here starts from the position *before* the burst and only moves as each
 * event plays: the die first, then the seed hops square by square, then captures.
 */
export class LudoPlayback {
  private queue: Event[] = [];
  private seeds: number[][] | null = null;
  private running = false;

  constructor(
    private hooks: PlaybackHooks,
    private reduce = false,
  ) {}

  get busy() {
    return this.running;
  }

  /** `before` is the board before these events (the snapshot hasn't caught up yet). */
  push(events: Event[], before: number[][] | undefined) {
    this.queue.push(...events);
    if (this.running || !this.queue.length) return;
    this.running = true;
    this.seeds = before ? copy(before) : null;
    // Freeze the board now: the snapshot arriving next is already the end of the turn.
    this.hooks.board(this.seeds ? copy(this.seeds) : null);
    this.next();
  }

  private next(): void {
    const e = this.queue.shift();
    if (!e) {
      this.running = false;
      this.seeds = null;
      this.hooks.board(null);
      this.hooks.actor(null);
      return;
    }
    const seat = Number(e.seat);
    switch (e.type) {
      case "rolled":
        this.hooks.actor(seat);
        this.hooks.event(e);
        return this.hooks.wait(this.reduce ? 300 : ROLL_SHOW_MS, () => this.next());
      case "moved": {
        const seed = Number(e.seed);
        const path = (e.path as number[] | undefined) ?? [Number(e.to)];
        const hops = this.reduce ? path.slice(-1) : path;
        this.hooks.event(e);
        hops.forEach((p, i) =>
          this.hooks.wait(i * HOP_MS, () => {
            const row = this.seeds?.[seat];
            if (row) row[seed] = p;
            if (this.seeds) this.hooks.board(copy(this.seeds));
            this.hooks.hop();
          }),
        );
        return this.hooks.wait(hops.length * HOP_MS + SETTLE_MS, () => this.next());
      }
      case "captured": {
        const row = this.seeds?.[Number(e.victimSeat)];
        if (row) row[Number(e.seed)] = -1;
        if (this.seeds) this.hooks.board(copy(this.seeds));
        this.hooks.event(e);
        return this.next();
      }
      default:
        this.hooks.event(e);
        return this.next();
    }
  }
}
