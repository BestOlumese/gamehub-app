"use client";

import { SHAPES, type Shape } from "@gamehub/engine/whot";
import { Dialog } from "@gamehub/ui/overlays/dialog";
import { SHAPE_NAMES, ShapeIcon } from "./whot-card";

type Props = { open: boolean; onPick: (s: Shape) => void; onClose: () => void };

/** After a Whot: which shape must the next player play? */
export function ShapePicker({ open, onPick, onClose }: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Call a shape"
      description="The next player must play this shape or a Whot."
    >
      <div className="grid grid-cols-5 gap-2">
        {SHAPES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="flex flex-col items-center gap-1.5 rounded-control border-2 border-line bg-surface py-3 text-whot transition-colors duration-(--dur-press) hover:border-whot active:bg-surface-2"
          >
            <ShapeIcon shape={s} size={28} />
            <span className="text-xs font-semibold text-ink">{SHAPE_NAMES[s]}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
