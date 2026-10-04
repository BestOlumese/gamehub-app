import { Server } from "partyserver";

/** One per queue, named `<game>-<size>` (e.g. `whot-4`). */
export class Matchmaker extends Server<Env> {
  static override options = { hibernate: true };
}
