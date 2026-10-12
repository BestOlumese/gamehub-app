"use client";

import {
  formation,
  POSITION_ROLES,
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
  disabled,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; hint: string }>;
  onChange: (v: T) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="grid grid-cols-4 gap-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
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
  cards,
  ready,
  act,
  subsLeft,
  off,
  live,
}: {
  /** In a match (not at a break): changes wait out the server's change gap. */
  live: boolean;
  open: boolean;
  onClose: () => void;
  sheet: TeamSheet;
  /** The opponent's current tactics (shown as "They play"), when in a match. */
  theirs: Tactics | null;
  cards: Record<string, Card>;
  ready: boolean;
  act: (a: FootballAction) => void;
  subsLeft: number | null;
  off?: readonly string[];
}) {
  const [tab, setTab] = useState<"tactics" | "team" | "roles">("tactics");
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
      <div className="mb-3 grid grid-cols-3 gap-1" role="tablist">
        {(["tactics", "team", "roles"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`h-9 rounded-control text-sm font-semibold ${tab === k ? "bg-ink text-surface" : "bg-surface-2"}`}
          >
            {k === "tactics"
              ? "Tactics"
              : k === "team"
                ? subsLeft !== null
                  ? "Subs"
                  : "Team"
                : "Roles"}
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
            disabled={!ready}
          />
          <Chips
            label="Without it"
            value={t.defence}
            options={DEFENCE}
            onChange={(defence) => set({ defence })}
            disabled={!ready}
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
      ) : tab === "team" ? (
        <TeamEditor
          sheet={sheet}
          cards={cards}
          ready={ready}
          act={act}
          subsLeft={subsLeft}
          off={off}
          live={live}
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
                <span className="min-w-0 flex-1 truncate">{c?.short}</span>
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
