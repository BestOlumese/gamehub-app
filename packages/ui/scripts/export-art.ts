import { mkdirSync, writeFileSync } from "node:fs";
import { staticArt } from "../src/art/static-art";

const out = new URL("../../../apps/web/public/art/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const [name, svg] of Object.entries(staticArt())) {
  writeFileSync(new URL(name, out), svg);
  console.log(`art: ${name} ${svg.length} B`);
}
