import { DurableObject } from "cloudflare:workers";

// One global instance ("global"): the strong bots' CPU budget on Vercel Hobby, which pauses the
// whole account when a limit is passed (docs/15-bot-service.md). Kept in memory, saved at most
// every 5 minutes, so it costs about one row write per 5 busy minutes.

/** Bots get half of Hobby's 4 Active-CPU hours a month. */
const MONTHLY_MS = 2 * 3600 * 1000;
/** 240 CPU-seconds a day on an even spread. */
const DAILY_MS = MONTHLY_MS / 30;
const SAVE_EVERY_MS = 5 * 60_000;

type Counter = { day: string; dayMs: number; month: string; monthMs: number };

const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const monthOf = (t: number) => new Date(t).toISOString().slice(0, 7);

function daysLeftInMonth(t: number): number {
  const d = new Date(t);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return last - d.getUTCDate() + 1;
}

export class Quota extends DurableObject<Env> {
  private c: Counter | null = null;
  private savedAt = 0;

  private load(now: number): Counter {
    if (!this.c) {
      const sql = this.ctx.storage.sql;
      sql.exec(
        "CREATE TABLE IF NOT EXISTS quota (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL)",
      );
      const row = sql.exec<{ json: string }>("SELECT json FROM quota WHERE id = 1").toArray()[0];
      this.c = row
        ? (JSON.parse(row.json) as Counter)
        : { day: dayOf(now), dayMs: 0, month: monthOf(now), monthMs: 0 };
    }
    const c = this.c;
    if (c.month !== monthOf(now)) Object.assign(c, { month: monthOf(now), monthMs: 0 });
    if (c.day !== dayOf(now)) Object.assign(c, { day: dayOf(now), dayMs: 0 });
    return c;
  }

  /** Today's limit: the even share, tightened when a heavy month leaves less per remaining day. */
  private dailyLimit(c: Counter, now: number): number {
    const left = Math.max(0, MONTHLY_MS - c.monthMs + c.dayMs); // today's use is still "today's"
    return Math.min(DAILY_MS, left / daysLeftInMonth(now));
  }

  /** May a room call the bot service now? */
  allowBot(): boolean {
    const now = Date.now();
    const c = this.load(now);
    return c.dayMs < this.dailyLimit(c, now);
  }

  /** Records CPU the service reported for one move. */
  addBot(cpuMs: number): void {
    const now = Date.now();
    const c = this.load(now);
    const ms = Math.max(0, Math.min(cpuMs, 30_000));
    c.dayMs += ms;
    c.monthMs += ms;
    if (now - this.savedAt >= SAVE_EVERY_MS) {
      this.savedAt = now;
      this.ctx.storage.sql.exec(
        "INSERT INTO quota (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json",
        JSON.stringify(c),
      );
    }
  }

  /** Tests and the weekly manual check. */
  usage(): Counter & { dailyLimit: number } {
    const now = Date.now();
    const c = this.load(now);
    return { ...c, dailyLimit: this.dailyLimit(c, now) };
  }
}
