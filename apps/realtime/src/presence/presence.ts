import { Server } from "partyserver";

/** One global instance. Online users and invite routing. */
export class Presence extends Server<Env> {
  static override options = { hibernate: true };
}
