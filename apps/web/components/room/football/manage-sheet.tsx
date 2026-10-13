"use client";

import {
  DEFAULT_INSTRUCTIONS,
  formation,
  GROUP,
  isKeeperStats,
  POSITION_ROLES,
  type Instructions,
  type BuildUp,
  type Card,
  type Defence,
  type FootballAction,
  type Tactics,
  type TeamSheet,
} from "@gamehub/engine/football";
import { Dialog } from "@gamehub/ui/overlays/dialog";
import { useEffect, useRef, useState } from "react";
import { sendChange, useChangeWaiting } from "./live-changes";
import { roleName } from "./look";
import { TeamEditor } from "./team-editor";

export const BUILD: Array<{ value: BuildUp; label: string; hint: string }> = [
  { value: "balanced", label: "Balanced", hint: "Safe against anything." },
  { value: "short", label: "Short", hint: "Breaks a deep block. Risky against a press." },
  { value: "long", label: "Long", hint: "Goes over a press. A deep block heads it away." },
  {
    value: "counter",
    label: "Counter",
    hint: "Hurts a high line and a press. No space against a deep block.",
  },
];
export const DEFENCE: Array<{ value: Defence; label: string; hint: string }> = [
  { value: "balanced", label: "Balanced", hint: "No weak spot." },
  { value: "high_press", label: "Press", hint: "Beats short passing. Long balls go over it." },
  { value: "mid_block", label: "Mid block", hint: "Compact, gives little away." },
  {
    value: "deep_block",
    label: "Deep",
    hint: "Stops long balls and counters. Patient passing breaks it.",
  },
];
export const styleName = (t: Tactics) =>
  `${DEFENCE.find((d) => d.value === t.defence)?.label ?? ""} + ${BUILD.find((b) => b.value === t.build)?.label ?? ""}`;

function Chips<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; hint: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="grid grid-cols-4 gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`h-10 rounded-control border text-sm font-semibold ${value === o.value ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface"}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-2">{options.find((o) => o.value === value)?.hint}</p>
    </fieldset>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-28 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-(--color-brand)"
      />
      <span className="w-8 text-right tabular-nums">{value}</span>
    </label>
  );
}

/** Manage: tactics (chips with what they beat, More for sliders), roles, and your team (subs in a match). */
export function ManageSheet({
  open,
  onClose,
  sheet,
  theirs,
  opponent = null,
  cards,
  ready,
  act,
  subsLeft,
  off,
  live,
  fit = null,
}: {
  /** Your players' stamina in a match (null outside one). */
  fit?: Record<string, number> | null;
  /** In a match (not at a break): changes wait out the server's change gap. */
  live: boolean;
  open: boolean;
  onClose: () => void;
  sheet: TeamSheet;
  /** The opponent's current tactics (shown as "They play"), when in a match. */
  theirs: Tactics | null;
  /** Their current team in a match (for marking and pressing); null outside one. */
  opponent?: TeamSheet | null;
  cards: Record<string, Card>;
  ready: boolean;
  act: (a: FootballAction) => void;
  subsLeft: number | null;
  off?: readonly string[];
}) {
  const [tab, setTab] = useState<"tactics" | "team" | "roles" | "orders">("tactics");
  const [more, setMore] = useState(false);
  const waiting = useChangeWaiting();
  // Your edits, kept here until the server's tactics match them. Sliders used to send every step
  // of a drag, and the refused ones snapped them back. `base` is the server's tactics when you
  // started: if the server moves somewhere else (a shout), its tactics win.
  const server = sheet.tactics;
  const key = JSON.stringify(server);
  const [edit, setEdit] = useState<{ base: string; t: Tactics } | null>(null);
  const t = edit && (edit.base === key || JSON.stringify(edit.t) === key) ? edit.t : server;
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (settle.current) clearTimeout(settle.current);
    },
    [],
  );
  /** Chips send at once; sliders once you stop dragging. */
  function set(patch: Partial<Tactics>, slide = false) {
    const next = { ...t, ...patch };
    setEdit({ base: key, t: next });
    if (settle.current) clearTimeout(settle.current);
    const send = () => sendChange("tactics", () => act({ type: "tactics", tactics: next }), live);
    if (slide) settle.current = setTimeout(send, 300);
    else send();
  }
  const slots = formation(sheet.formation).slots;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Manage"
      description={theirs ? `They play: ${styleName(theirs)}` : undefined}
    >
      <div className="mb-3 grid grid-cols-4 gap-1" role="tablist">
        {(["tactics", "team", "roles", "orders"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`h-9 rounded-control px-0.5 text-xs font-semibold ${tab === k ? "bg-ink text-surface" : "bg-surface-2"}`}
          >
            {k === "tactics"
              ? "Tactics"
              : k === "team"
                ? subsLeft !== null
                  ? "Subs"
                  : "Team"
                : k === "roles"
                  ? "Roles"
                  : "Instructions"}
          </button>
        ))}
      </div>
      {tab === "tactics" ? (
        <div className="space-y-4">
          <Chips
            label="With the ball"
            value={t.build}
            options={BUILD}
            onChange={(build) => set({ build })}
          />
          <Chips
            label="Without it"
            value={t.defence}
            options={DEFENCE}
            onChange={(defence) => set({ defence })}
          />
          <button
            type="button"
            className="text-sm font-semibold text-brand-strong underline"
            onClick={() => setMore((m) => !m)}
          >
            {more ? "Less" : "More"}
          </button>
          <p className="min-h-4 text-xs text-ink-2" aria-live="polite">
            {waiting ? "Sending your change…" : ""}
          </p>
          {more ? (
            <div className="space-y-2">
              <Slider
                label="Line height"
                value={t.line}
                min={0}
                max={100}
                onChange={(line) => set({ line }, true)}
              />
              <Slider
                label="Width"
                value={t.width}
                min={0}
                max={100}
                onChange={(width) => set({ width }, true)}
              />
              <Slider
                label="Tempo"
                value={t.tempo}
                min={0}
                max={100}
                onChange={(tempo) => set({ tempo }, true)}
              />
              <Slider
                label="In the box"
                value={t.inBox}
                min={1}
                max={5}
                onChange={(inBox) => set({ inBox }, true)}
              />
            </div>
          ) : null}
        </div>
      ) : tab === "orders" ? (
        <InstructionsTab
          sheet={sheet}
          opponent={opponent}
          cards={cards}
          send={(instructions) =>
            sendChange("instructions", () => act({ type: "instructions", instructions }), live)
          }
        />
      ) : tab === "team" ? (
        <TeamEditor
          sheet={sheet}
          cards={cards}
          ready={ready}
          act={act}
          subsLeft={subsLeft}
          off={off}
          live={live}
          fit={fit}
        />
      ) : (
        <ul className="divide-y divide-line">
          {sheet.xi.map((x, i) => {
            const pos = slots[i]?.pos;
            const c = cards[x.id];
            if (!pos) return null;
            return (
              <li key={i} className="flex items-center gap-2 py-2 text-sm">
                <span className="w-9 font-bold text-ink-2">{pos}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{c?.short}</span>
                  {fit?.[x.id] !== undefined ? <StaminaBar value={fit[x.id] as number} /> : null}
                </span>
                <select
                  value={x.role}
                  disabled={!ready}
                  onChange={(e) => {
                    const role = e.target.value as (typeof POSITION_ROLES)[typeof pos][number];
                    sendChange(`role:${i}`, () => act({ type: "role", slot: i, role }), live);
                  }}
                  className="h-9 rounded-control border border-line bg-surface px-2"
                  aria-label={`Role for ${c?.short ?? pos}`}
                >
                  {POSITION_ROLES[pos].map((r) => (
                    <option key={r} value={r}>
                      {roleName(r)}
                      {c?.roles[r] === "plusplus" ? " ++" : c?.roles[r] === "plus" ? " +" : ""}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}

/** A player's stamina: green while fresh, amber when tiring, red when spent. */
export function StaminaBar({ value, className = "" }: { value: number; className?: string }) {
  const colour = value < 40 ? "bg-danger" : value < 55 ? "bg-accent" : "bg-brand";
  return (
    <span
      className={`block h-1 w-full max-w-24 overflow-hidden rounded-full bg-[rgb(0_0_0/0.12)] ${className}`}
      role="meter"
      aria-label="Stamina"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className={`block h-full ${colour}`} style={{ width: `${Math.round(value)}%` }} />
    </span>
  );
}

/**
 * Targeted instructions (design decision, Oct 2026: a Manage tab of its own; hidden from the
 * opponent): where to attack (and who you'd be running at), who to man-mark, whose passing to
 * press. Marking and pressing need their team, so only in a match.
 */
function InstructionsTab({
  sheet,
  opponent,
  cards,
  send,
}: {
  sheet: TeamSheet;
  opponent: TeamSheet | null;
  cards: Record<string, Card>;
  send: (i: Instructions) => void;
}) {
  const ins = sheet.instructions ?? DEFAULT_INSTRUCTIONS;
  const set = (patch: Partial<Instructions>) => send({ ...ins, ...patch });
  const theirs = opponent
    ? formation(opponent.formation).slots.flatMap((sl, i) => {
        const id = opponent.xi[i]?.id;
        const c = id ? cards[id] : undefined;
        return c && sl.pos !== "GK" ? [{ id: id as string, c, sl }] : [];
      })
    : [];
  // Who you'd run at: your left faces their right (their x > 60), and so on.
  const facing = (flank: Instructions["flank"]) => {
    const side = theirs.filter(({ sl }) =>
      flank === "left" ? sl.x > 60 : flank === "right" ? sl.x < 40 : sl.x >= 35 && sl.x <= 65,
    );
    const defenders = side.filter(({ sl }) => GROUP[sl.pos] === "DEF");
    return (defenders.length ? defenders : side)
      .sort((a, b) => (flank === "centre" ? 0 : Math.abs(b.sl.x - 50) - Math.abs(a.sl.x - 50)))
      .map(({ c, sl }) => `${c.short} ${c.ovr} ${sl.pos}`)
      .slice(0, 2)
      .join(", ");
  };
  const best = [...theirs].sort((a, b) => b.c.ovr - a.c.ovr).slice(0, 3);
  const passes = (c: Card) => (isKeeperStats(c.stats) ? 99 : c.stats.pas);
  const poorPassers = [...theirs].sort((a, b) => passes(a.c) - passes(b.c)).slice(0, 3);
  const FLANKS = [
    { value: "left", label: "Left" },
    { value: "centre", label: "Centre" },
    { value: "right", label: "Right" },
    { value: "mixed", label: "Mixed" },
  ] as const;
  return (
    <div className="space-y-4">
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-semibold">Attack through</legend>
        <div className="grid grid-cols-4 gap-1">
          {FLANKS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={ins.flank === f.value}
              onClick={() => set({ flank: f.value })}
              className={`h-10 rounded-control border text-sm font-semibold ${ins.flank === f.value ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-2">
          {ins.flank === "mixed"
            ? "No favourite side."
            : opponent
              ? `You'd run at: ${facing(ins.flank) || "nobody in particular"}.`
              : "Pick a side that suits your wingers."}
        </p>
      </fieldset>
      {opponent ? (
        <>
          <Pick
            label="Man-mark their best"
            hint="He'll see far less of the ball; your defence is stretched a little elsewhere."
            value={ins.mark}
            options={best.map(({ id, c, sl }) => ({
              id,
              text: `${c.short} · ${sl.pos} · ${c.ovr}`,
            }))}
            onChange={(mark) => set({ mark })}
          />
          <Pick
            label="Press when he has it"
            hint="Works the worse a passer he is. Costs some fouls and legs."
            value={ins.press}
            options={poorPassers.map(({ id, c, sl }) => ({
              id,
              text: `${c.short} · ${sl.pos} · PAS ${passes(c)}`,
            }))}
            onChange={(press) => set({ press })}
          />
        </>
      ) : (
        <p className="text-sm text-ink-2">Marking and pressing open once you know their team.</p>
      )}
    </div>
  );
}

function Pick({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint: string;
  value: string | null;
  options: Array<{ id: string; text: string }>;
  onChange: (v: string | null) => void;
}) {
  const row = (id: string | null, text: string) => (
    <button
      key={id ?? "none"}
      type="button"
      role="radio"
      aria-checked={value === id}
      onClick={() => onChange(id)}
      className={`flex h-10 items-center gap-2 rounded-control border px-3 text-left text-sm ${value === id ? "border-brand bg-brand-soft font-semibold text-brand-strong" : "border-line bg-surface"}`}
    >
      <span
        className={`size-3 shrink-0 rounded-full border-2 ${value === id ? "border-brand bg-brand" : "border-line"}`}
      />
      {text}
    </button>
  );
  return (
    <div className="space-y-1.5" role="radiogroup" aria-label={label}>
      <p className="text-sm font-semibold">{label}</p>
      <div className="grid gap-1">
        {options.map((o) => row(o.id, o.text))}
        {row(null, "Nobody")}
      </div>
      <p className="text-xs text-ink-2">{hint}</p>
    </div>
  );
}
