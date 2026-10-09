// The rent table in docs/games/property.md, generated from the formula (never typed by hand).
import { BUILD_COST, CITY_NAME, mortgageValue, naira, plotRent, SPACES } from "./board";

export function rentTableMarkdown(): string {
  const rows = [
    "| Group | Space | Area (city) | Price | Rent | Group rent | 1 house | 2 | 3 | 4 | Hotel | Build | Mortgage |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  SPACES.forEach((s, i) => {
    if (s.kind !== "plot") return;
    const r = (h: number) => naira(plotRent(i, h));
    const group = s.group[0]?.toUpperCase() + s.group.slice(1);
    rows.push(
      `| ${group} | ${i} | ${s.name} (${CITY_NAME[s.city]}) | ${naira(s.price)} | ${r(0)} | ${naira(plotRent(i, 0) * 2)} | ${r(1)} | ${r(2)} | ${r(3)} | ${r(4)} | ${r(5)} | ${naira(BUILD_COST[s.group])} | ${naira(mortgageValue(i))} |`,
    );
  });
  return rows.join("\n");
}
