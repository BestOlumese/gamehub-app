import { describe, it } from "vitest";
import { balanceReport } from "./balance";

// Slow (minutes): run with BALANCE=<games per player count>, e.g. BALANCE=500 pnpm vitest run balance.
const games = Number(process.env.BALANCE ?? 0);

describe.skipIf(!games)("Naija Plots balance", () => {
  it("prints the band report", () => {
    const lines = ["| Players | Band | Value | Pass |", "|---|---|---|---|"];
    const counts = (process.env.BALANCE_PLAYERS ?? "2,4,6,8").split(",").map(Number);
    for (const players of counts) {
      const r = balanceReport(games, players);
      for (const b of r.bands)
        lines.push(`| ${players} | ${b.band} | ${b.value} | ${b.pass ? "yes" : "**no**"} |`);
      lines.push(`| ${players} | Group win rates (games held) | ${r.groups} | |`);
    }
    console.log(lines.join("\n"));
  }, 3_600_000);
});

describe.skipIf(!process.env.RENT_TABLE)("Naija Plots rent table", () => {
  it("prints the table for the docs", async () => {
    const { rentTableMarkdown } = await import("./rent-table");
    console.log(rentTableMarkdown());
  });
});
