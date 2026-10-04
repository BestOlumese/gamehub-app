import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { staticArt } from "./static-art";

const dir = new URL("../../../../apps/web/public/art/", import.meta.url);

describe("static art", () => {
  it("committed SVG files match the components (run `pnpm --filter @gamehub/ui art`)", () => {
    for (const [name, svg] of Object.entries(staticArt())) {
      expect(readFileSync(new URL(name, dir), "utf8"), name).toBe(svg);
    }
  });
});
