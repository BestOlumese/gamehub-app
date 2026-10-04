"use client";

import { tttNaija, type TttRules } from "@gamehub/engine/tictactoe";
import { Button } from "@gamehub/ui/forms/button";
import { Switch } from "@gamehub/ui/forms/switch";
import { Dialog } from "@gamehub/ui/overlays/dialog";
import { BookOpen, LogOut, Menu, Share2, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { describeTttRules } from "@/components/create-room/ttt-rules-step";
import { setSound } from "@/app/(app)/play/preferences";
import { SharePanel } from "./share-panel";

type Props = {
  code: string;
  rules: unknown;
  soundOn: boolean;
  playing: boolean;
  onLeave: () => void;
};

const item =
  "flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-sm font-semibold hover:bg-surface-2 focus-visible:bg-surface-2 outline-none";

export function RoomMenu({ code, rules, soundOn: initialSound, playing, onLeave }: Props) {
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
        <p>{describeTttRules((rules ?? tttNaija) as TttRules)}.</p>
        <p className="mt-3 text-sm text-ink-2">
          Get three in a row to win a round. If you run out of time, a move is made for you.
        </p>
      </Dialog>
      <Dialog open={dialog === "share"} onClose={() => setDialog(null)} title="Share this room">
        <SharePanel code={code} gameName="Tic-tac-toe" />
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
