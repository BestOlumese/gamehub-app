import { Server } from "partyserver";

/** One per room. Seats, rules, game state and deadlines (docs/05-durable-objects.md). */
export class GameRoom extends Server<Env> {
  static override options = { hibernate: true };
}
