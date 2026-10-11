// Commentary lines for match events (match-engine.md → Commentary). Deterministic: the line is
// chosen from the event itself, so the server never stores text and every client shows the same.
import type { MatchEvent, Side } from "./match";

type Names = {
  player: (id: string) => string;
  team: (side: Side) => string;
};

const LINES = {
  goal: [
    "GOAL! {player} finishes it off. {score}.",
    "{player} buries it! {score}.",
    "Omo! {player} has done it! {score}.",
    "{player} scores, and {team} celebrate. {score}.",
  ],
  goalHeader: ["Header in! {player} rises highest. {score}.", "{player} heads it home! {score}."],
  saved: [
    "Big save from {keeper}!",
    "{keeper} says no to {player}.",
    "No wahala for {keeper}, held comfortably.",
  ],
  missed: [
    "{player} drags it wide.",
    "Over the bar from {player}.",
    "Chance gone. {player} will want that one back.",
  ],
  blocked: ["Blocked! {player}'s shot hits a defender.", "{player} shoots, but it's charged down."],
  post: ["Off the post! {player} so close.", "{player} hits the woodwork!"],
  through_ball: ["Lovely ball in behind for {player}…", "{player} is through…"],
  cross: ["{team} whip a cross in for {player}…", "Ball into the box, {player} attacking it…"],
  long_shot: ["{player} tries his luck from distance…"],
  free_kick_chance: ["{player} lines up the free kick…"],
  corner_chance: ["Corner swung in, {player} goes for it…"],
  counter: ["{team} break at pace, {player} away…", "Counter-attack! {player} has space…"],
  direct: ["Long ball forward, {player} chasing…", "{team} go direct for {player}…"],
  corner: ["Corner to {team}."],
  offside: ["Flag's up. {player} went too early.", "Offside against {player}."],
  free_kick: ["Free kick to {team} in a good area."],
  foul: ["Free kick. {player} catches him late.", "Foul by {player}."],
  yellow: ["Yellow card for {player}.", "{player} goes into the book."],
  red: ["RED CARD! {player} is off. {team} down to ten."],
  second_yellow: ["Second yellow for {player}! He's off, {team} down to ten."],
  sub: ["Change for {team}: {on} comes on for {off}."],
  tactics: ["{team} change their approach.", "New instructions from the {team} bench."],
  kickoff: ["We're under way."],
  half_time: ["Half time. {score}."],
  full_time: ["Full time! {score}.", "That's it! {score}."],
  et_start: ["Extra time begins."],
  et_half: ["Half time in extra time. {score}."],
  et_end: ["End of extra time. {score}. Penalties next."],
  pen_scored: ["{player} steps up… scores!", "{player} sends the keeper the wrong way."],
  pen_missed: [
    "{player}'s penalty is saved by {keeper}!",
    "{player} misses! {keeper} guessed right.",
  ],
} as const;

/** A small, stable hash of the event, to pick one of its lines. */
function choose(e: MatchEvent, n: number): number {
  const key = `${e.m}:${e.o}:${e.t}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) % n;
}

const fill = (line: string, vars: Record<string, string>) =>
  line.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");

/** The commentary line for an event, or null for events that only update the ticker. */
export function commentary(
  e: MatchEvent,
  names: Names,
  score: readonly [number, number],
): string | null {
  const s = `${names.team(0)} ${score[0]}–${score[1]} ${names.team(1)}`;
  const line = (lines: readonly string[], vars: Record<string, string>) =>
    fill(lines[choose(e, lines.length)] as string, { score: s, ...vars });
  switch (e.t) {
    case "goal":
      return line(e.header ? LINES.goalHeader : LINES.goal, {
        player: names.player(e.player),
        team: names.team(e.team),
        score: `${names.team(0)} ${e.score[0]}–${e.score[1]} ${names.team(1)}`,
      });
    case "shot":
      if (e.result === "goal") return null; // the goal event says it
      if (e.result === "saved") return null; // the save event says it
      return line(LINES[e.result], { player: names.player(e.player) });
    case "save":
      return line(LINES.saved, { keeper: names.player(e.keeper), player: names.player(e.player) });
    case "chance": {
      const kind =
        e.kind === "free_kick"
          ? "free_kick_chance"
          : e.kind === "corner"
            ? "corner_chance"
            : e.kind;
      if (kind === "build_up") return null;
      return line(LINES[kind], { player: names.player(e.player), team: names.team(e.team) });
    }
    case "corner":
    case "free_kick":
      return line(LINES[e.t], { team: names.team(e.team) });
    case "offside":
      return line(LINES.offside, { player: e.player ? names.player(e.player) : "the striker" });
    case "foul":
      return line(LINES[e.card ?? "foul"], {
        player: names.player(e.player),
        team: names.team(e.team),
      });
    case "ball":
      return null;
    case "tactics":
      return line(LINES.tactics, { team: names.team(e.team) });
    case "sub":
      return line(LINES.sub, {
        team: names.team(e.team),
        on: names.player(e.on),
        off: names.player(e.off),
      });
    case "pen":
      return line(e.scored ? LINES.pen_scored : LINES.pen_missed, {
        player: names.player(e.taker),
        keeper: names.player(e.keeper),
      });
    default:
      return line(LINES[e.t], {});
  }
}

/** Every template, for the banned-words test. */
export const ALL_LINES: readonly string[] = Object.values(LINES).flat();
