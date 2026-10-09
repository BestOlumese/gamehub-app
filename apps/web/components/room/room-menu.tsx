"use client";

import type { GameSlug } from "@gamehub/engine";
import { Button } from "@gamehub/ui/forms/button";
import { Switch } from "@gamehub/ui/forms/switch";
import { Dialog } from "@gamehub/ui/overlays/dialog";
import { BookOpen, LogOut, Menu, Share2, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { describeRules, GAME_NAMES } from "@/lib/game-meta";
import { setSound } from "@/app/(app)/play/preferences";
import { useRoom } from "@/lib/room/store";
import { SharePanel } from "./share-panel";

type Props = {
  code: string;
  game: GameSlug | null;
  rules: unknown;
  soundOn: boolean;
  playing: boolean;
  onLeave: () => void;
};

const item =
  "flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-sm font-semibold hover:bg-surface-2 focus-visible:bg-surface-2 outline-none";

export function RoomMenu({ code, game, rules, soundOn: initialSound, playing, onLeave }: Props) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"rules" | "share" | "leave" | null>(null);
  const [soundOn, setSoundOn] = useState(initialSound);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const openDialog = (d: typeof dialog) => {
    setOpen(false);
    setDialog(d);
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="Game menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex size-10 items-center justify-center rounded-control hover:bg-surface-2"
      >
        <Menu size={22} aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute top-full right-0 z-50 mt-1 w-60 rounded-card border border-line bg-surface p-1.5 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => openDialog("rules")}
          >
            <BookOpen size={18} className="text-ink-2" aria-hidden="true" /> Rules of this room
          </button>
          <div className={`${item} justify-between hover:bg-transparent`}>
            <span id="menu-sound" className="flex items-center gap-3">
              <Volume2 size={18} className="text-ink-2" aria-hidden="true" /> Sound
            </span>
            <Switch
              checked={soundOn}
              labelledBy="menu-sound"
              onChange={(v) => {
                setSoundOn(v);
                useRoom.setState({ soundOn: v });
                void setSound(v);
              }}
            />
          </div>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => openDialog("share")}
          >
            <Share2 size={18} className="text-ink-2" aria-hidden="true" /> Share room link
          </button>
          <div className="my-1 h-px bg-line" role="separator" />
          <button
            type="button"
            role="menuitem"
            className={`${item} text-danger-strong`}
            onClick={() => openDialog("leave")}
          >
            <LogOut size={18} aria-hidden="true" /> Leave game
          </button>
        </div>
      ) : null}

      <Dialog open={dialog === "rules"} onClose={() => setDialog(null)} title="Rules of this room">
        <p>{game ? `${describeRules(game, rules)}.` : ""}</p>
        <p className="mt-3 text-sm text-ink-2">
          {game === "rps"
            ? "Rock blunts scissors, scissors cut paper, paper covers rock. Run out of time and a throw is made for you."
            : game === "plots"
              ? "Roll and move. Buy the plots you land on, or let them go to auction. Own a whole colour group to build houses and a hotel; others pay you rent when they land there. Trade any time. Can't pay? Sell, mortgage, or go bankrupt. Timed games: the richest when the clock runs out wins."
              : game === "draughts"
                ? "Move your seeds one square forward on the dark squares. Jump an opponent's seed to take it; if you can take, you must, and keep jumping while you can. Reach the far row to crown a king. Take every seed, or leave them no move, to win. Nobody moving in the first 30 seconds aborts the game."
                : game === "chess"
                  ? "Standard chess. Checkmate wins; stalemate, repeats and dead positions are draws. Run out of time and you lose, unless your opponent can't mate. Nobody moving in the first 30 seconds aborts the game."
                  : game === "snakes"
                    ? "Roll and move that many squares. A ladder takes you up, a snake brings you down. First to 100 wins. Run out of time and the die rolls for you."
                    : game === "ludo"
                      ? "Roll, then move a seed that many squares. Bring all four seeds home first to win. Land on a rival to send it back to its yard. Run out of time and a move is made for you."
                      : game === "whot"
                        ? "Match the call card by shape or number. Whot is wild: call any shape. Can't play? Go to market. Run out of time and you go to market."
                        : "Get three in a row to win a round. If you run out of time, a move is made for you."}
        </p>
      </Dialog>
      <Dialog open={dialog === "share"} onClose={() => setDialog(null)} title="Share this room">
        <SharePanel code={code} gameName={game ? GAME_NAMES[game] : "GameHub"} />
      </Dialog>
      <Dialog
        open={dialog === "leave"}
        onClose={() => setDialog(null)}
        title="Leave the game?"
        description={
          playing
            ? "A bot will take your seat so the game can carry on."
            : "You'll leave this room."
        }
      >
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setDialog(null)}>
            Stay
          </Button>
          <Button variant="danger" onClick={onLeave}>
            Leave
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
