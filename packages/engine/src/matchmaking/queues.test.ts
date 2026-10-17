import { describe, expect, it } from "vitest";
import { chess } from "../games/chess";
import { draughts } from "../games/draughts";
import { whot } from "../games/whot";
import { chessCategory, displayRating, queueOf, QUICK_GAMES } from "./queues";

describe("quick-match queues", () => {
  it("names queues by game and size, clock or variant; fixed rules every game accepts", () => {
    expect(queueOf({ game: "whot", players: 4 })?.key).toBe("whot-4");
    const c = queueOf({
      game: "chess",
      players: 2,
      timeControl: { baseSeconds: 180, incrementSeconds: 2 },
    });
    expect(c).toMatchObject({
      key: "chess-3+2",
      variant: "blitz",
      timeControl: "3+2",
      ranked: true,
    });
    expect(chess.ruleSchema.safeParse(c?.rules).success).toBe(true);
    expect((c?.rules as { takebacks: boolean }).takebacks).toBe(false);
    const d = queueOf({ game: "draughts", players: 2, variant: "english8" });
    expect(d).toMatchObject({ key: "draughts-english8-5+3", variant: "english8" });
    expect(draughts.ruleSchema.safeParse(d?.rules).success).toBe(true);
    expect(whot.ruleSchema.safeParse(queueOf({ game: "whot", players: 3 })?.rules).success).toBe(
      true,
    );
    // Not offered: a chess game without a clock, Ludo for 6, Naija Plots and football ranked.
    expect(queueOf({ game: "chess", players: 2, timeControl: null })).toBeNull();
    expect(queueOf({ game: "ludo", players: 6 })).toBeNull();
    expect(QUICK_GAMES.plots.ranked).toBe(false);
    expect(QUICK_GAMES.football.ranked).toBe(false);
  });

  it("chess pools by clock, and the friendly rating starts at 1000", () => {
    expect(chessCategory({ baseSeconds: 60, incrementSeconds: 0 })).toBe("bullet");
    expect(chessCategory({ baseSeconds: 120, incrementSeconds: 1 })).toBe("bullet");
    expect(chessCategory({ baseSeconds: 180, incrementSeconds: 0 })).toBe("blitz");
    expect(chessCategory({ baseSeconds: 300, incrementSeconds: 3 })).toBe("blitz");
    expect(chessCategory({ baseSeconds: 600, incrementSeconds: 0 })).toBe("rapid");
    expect(displayRating({ mu: 25, sigma: 25 / 3 })).toBe(1000);
    expect(displayRating({ mu: 0, sigma: 25 / 3 })).toBe(0);
  });
});
