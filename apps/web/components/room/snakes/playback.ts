import { HOP_MS, ROLL_SHOW_MS, SETTLE_MS, SLIDE_MS } from "@gamehub/engine/snakes";
import { bendFor, slidePoints, type Pt } from "./geometry";

type Event = { type: string } & Record<string, unknown>;

export type SnakesPlaybackHooks = {
  /** Squares as they should look right now (null: show the latest snapshot). */
  board(squares: number[] | null): void;
  /** A token part-way along a ladder or snake (null when no slide is running). */
  slide(s: { seat: number; at: Pt } | null): void;
  actor(seat: number | null): void;
  event(e: Event): void;
  hop(): void;
  wait(ms: number, fn: () => void): void;
};

const SLIDE_STEPS = 14;

/**
 * Plays a burst of Snakes & Ladders events at human speed: the die, the token hopping
 * square by square, then sliding up the ladder or down the snake. Like Ludo, the board
 * starts from the position *before* the burst, so nothing ever jumps ahead and back.
 */
export class SnakesPlayback {
  private queue: Event[] = [];
  private squares: number[] | null = null;
  private running = false;

  constructor(
    private hooks: SnakesPlaybackHooks,
    private reduce = false,
  ) {}

  get busy() {
    return this.running;
  }

  push(events: Event[], before: number[] | undefined) {
    this.queue.push(...events);
    if (this.running || !this.queue.length) return;
    this.running = true;
    this.squares = before ? [...before] : null;
    this.hooks.board(this.squares ? [...this.squares] : null);
    this.next();
  }

  private set(seat: number, square: number) {
    if (this.squares) this.squares[seat] = square;
    this.hooks.board(this.squares ? [...this.squares] : null);
  }

  private next(): void {
    const e = this.queue.shift();
    if (!e) {
      this.running = false;
      this.squares = null;
      this.hooks.board(null);
      this.hooks.slide(null);
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
        const path = (e.path as number[] | undefined) ?? [Number(e.to)];
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
      case "ladder":
      case "snake": {
        const from = Number(e.from);
        const to = Number(e.to);
        this.hooks.event(e);
        if (this.reduce) {
          this.set(seat, to);
          return this.next();
        }
        const pts = slidePoints(
          e.type,
          from,
          to,
          e.type === "snake" ? bendFor(from) : 1,
          SLIDE_STEPS,
        );
        const step = SLIDE_MS / SLIDE_STEPS;
        pts.forEach((at, i) => this.hooks.wait(i * step, () => this.hooks.slide({ seat, at })));
        return this.hooks.wait(SLIDE_MS + 40, () => {
          this.hooks.slide(null);
          this.set(seat, to);
          this.next();
        });
      }
      case "bumped":
        this.set(Number(e.victim), 0);
        this.hooks.event(e);
        return this.next();
      default:
        this.hooks.event(e);
        return this.next();
    }
  }
}
