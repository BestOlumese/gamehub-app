"use client";

import type { GameSlug } from "@gamehub/engine";
import type { ChessRules } from "@gamehub/engine/chess";
import type { DraughtsRules } from "@gamehub/engine/draughts";
import type { FootballRules } from "@gamehub/engine/football";
import type { LudoRules } from "@gamehub/engine/ludo";
import type { PlotsRules } from "@gamehub/engine/plots";
import type { RpsRules } from "@gamehub/engine/rps";
import type { SnakesRules } from "@gamehub/engine/snakes";
import type { TttRules } from "@gamehub/engine/tictactoe";
import type { WhotRules } from "@gamehub/engine/whot";
import { ChessRulesStep } from "@/components/create-room/chess-rules-step";
import { DraughtsRulesStep } from "@/components/create-room/draughts-rules-step";
import { FootballRulesStep } from "@/components/create-room/football-rules-step";
import { LudoRulesStep } from "@/components/create-room/ludo-rules-step";
import { PlotsRulesStep } from "@/components/create-room/plots-rules-step";
import { RpsRulesStep } from "@/components/create-room/rps-rules-step";
import { SnakesRulesStep } from "@/components/create-room/snakes-rules-step";
import { TttRulesStep } from "@/components/create-room/ttt-rules-step";
import { WhotRulesStep } from "@/components/create-room/whot-rules-step";

/** The game's own rules sheet (the same one rooms use). */
export function StageRules({
  game,
  rules,
  players,
  onChange,
}: {
  game: GameSlug;
  rules: unknown;
  players: number;
  onChange: (r: unknown) => void;
}) {
  switch (game) {
    case "whot":
      return <WhotRulesStep rules={rules as WhotRules} onChange={onChange} />;
    case "ludo":
      return <LudoRulesStep rules={rules as LudoRules} onChange={onChange} />;
    case "snakes":
      return <SnakesRulesStep rules={rules as SnakesRules} onChange={onChange} />;
    case "chess":
      return <ChessRulesStep rules={rules as ChessRules} onChange={onChange} />;
    case "draughts":
      return <DraughtsRulesStep rules={rules as DraughtsRules} onChange={onChange} />;
    case "plots":
      return <PlotsRulesStep rules={rules as PlotsRules} onChange={onChange} />;
    case "football":
      return (
        <FootballRulesStep rules={rules as FootballRules} players={players} onChange={onChange} />
      );
    case "rps":
      return <RpsRulesStep rules={rules as RpsRules} onChange={onChange} />;
    default:
      return <TttRulesStep rules={rules as TttRules} onChange={onChange} />;
  }
}
