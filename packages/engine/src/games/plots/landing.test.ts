import { it } from "vitest";
import { GROUP_SPACES, GROUPS, SPACES } from "./board";
import { plotsNaija } from "./rules";
import { simulate } from "./sim";

it.skipIf(!process.env.LANDING)(
  "landing frequency per space",
  () => {
    const counts = new Array(40).fill(0);
    let total = 0;
    for (let g = 0; g < 400; g++) {
      const { events } = simulate({ ...plotsNaija, mode: "classic" }, 4, `land-${g}`, {
        keepEvents: true,
        stepMs: 100,
        maxActions: 100_000,
        stopAfterTurns: 600,
      });
      for (const e of events)
        if (e.type === "moved") {
          counts[Number(e.to)]++;
          total++;
        }
    }
    const mean = total / 40;
    console.log(JSON.stringify(counts.map((c) => +(c / mean).toFixed(2))));
    for (const g of GROUPS)
      console.log(
        g,
        (
          GROUP_SPACES[g].reduce((a, i) => a + counts[i], 0) /
          GROUP_SPACES[g].length /
          mean
        ).toFixed(3),
      );
    console.log(
      "transport",
      [4, 14, 24, 34].map((i) => (counts[i] / mean).toFixed(2)).join(" "),
      SPACES.length,
    );
  },
  600_000,
);
