"use client";

import type { BotLevel, ClientRoomMsg } from "@gamehub/protocol";
import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Alert } from "@gamehub/ui/forms/alert";
import { Button } from "@gamehub/ui/forms/button";
import { Bot, Crown, Pencil, Shuffle, UserRoundPlus, X } from "lucide-react";
import { useState } from "react";
import dynamic from "next/dynamic";
import type { CreatableGame } from "@/components/create-room/create-room-sheet";
import { describeRules, FIRST_PLAYER, GAME_NAMES, hasFirstPlayer } from "@/lib/game-meta";
import type { Snapshot } from "@/lib/room/store";
import { SharePanel } from "./share-panel";

const LEVELS: BotLevel[] = ["easy", "medium", "hard"];
// Only the host ever opens it, so it loads on demand (keeps the room page light).
const CreateRoomSheet = dynamic(() =>
  import("@/components/create-room/create-room-sheet").then((m) => m.CreateRoomSheet),
);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Props = { snap: Snapshot; send: (m: ClientRoomMsg) => void; notice: string | null };

export function Lobby({ snap, send, notice }: Props) {
  const [editing, setEditing] = useState(false);
  const me = snap.you === "spectator" ? null : snap.seats[snap.you];
  const isHost = !!me?.host;
  const host = snap.seats.find((s) => s.host);
  const filled = snap.seats.filter((s) => s.status !== "empty").length;
  const empty = snap.room.size - filled;
  const people = snap.seats.filter((s) => s.userId).length;
  // The website goes live before the game server updates; an older server doesn't send this yet.
  const firstPlayer = snap.room.firstPlayer ?? "random";
  // Empty seats get bots at start (if the host chose that), or are dropped if enough people are in.
  const canStart = empty === 0 || !!snap.room.botFill || filled >= snap.room.minPlayers;
  const startLabel =
    empty === 0
      ? "Start game"
      : snap.room.botFill
        ? `Start game · bots take ${empty} ${empty === 1 ? "seat" : "seats"}`
        : filled >= snap.room.minPlayers
          ? `Start with ${filled} players`
          : "Waiting for players";

  return (
    <div className="mx-auto w-full max-w-lg space-y-6 px-4 py-6">
      <SharePanel code={snap.room.code ?? ""} gameName={GAME_NAMES[snap.room.game]} />

      <section aria-labelledby="players-h">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 id="players-h" className="text-sm font-semibold text-ink-2">
            Players
          </h2>
          <span className="flex items-center gap-3 text-sm text-ink-2 tabular-nums">
            {isHost && filled > 1 ? (
              <button
                type="button"
                onClick={() => send({ t: "shuffle" })}
                className="inline-flex items-center gap-1.5 rounded-control px-2 py-1 font-semibold text-brand-strong hover:bg-brand-soft"
              >
                <Shuffle size={15} aria-hidden="true" /> Shuffle seats
              </button>
            ) : null}
            {filled}/{snap.room.size}
          </span>
        </div>
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-sm">
          {snap.seats.map((seat) => (
            <li key={seat.index} className="flex flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3">
              {seat.status === "empty" ? (
                <span className="flex size-10 items-center justify-center rounded-full border-2 border-dashed border-line text-ink-3">
                  <UserRoundPlus size={18} aria-hidden="true" />
                </span>
              ) : seat.userId ? (
                <span className={seat.status === "away" ? "opacity-40 grayscale" : ""}>
                  <Avatar username={seat.name} image={seat.avatar} size={40} />
                </span>
              ) : (
                <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-ink-2">
                  <Bot size={20} aria-hidden="true" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-semibold">
                  {seat.status === "empty"
                    ? "Waiting for a friend…"
                    : seat.userId
                      ? `@${seat.name}`
                      : seat.name}
                  {seat.host ? <Crown size={15} className="text-accent" aria-label="Host" /> : null}
                </p>
                <p className="text-sm text-ink-2">
                  {seat.status === "connected"
                    ? seat.index === snap.you
                      ? "You"
                      : "Here"
                    : seat.status === "away"
                      ? "Not here right now"
                      : seat.status === "bot"
                        ? "Computer player"
                        : "Open seat"}
                </p>
              </div>
              {isHost && seat.status === "empty" ? (
                <div className="flex w-full gap-2 sm:w-auto" role="group" aria-label="Add a bot">
                  {LEVELS.map((l) => (
                    <Button
                      key={l}
                      variant="secondary"
                      size="md"
                      className="flex-1 px-3 sm:flex-none"
                      onClick={() => send({ t: "seat_bot", seat: seat.index, level: l })}
                    >
                      {cap(l)}
                    </Button>
                  ))}
                </div>
              ) : null}
              {isHost && seat.status === "bot" && !seat.userId ? (
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => send({ t: "seat_bot", seat: seat.index, level: null })}
                >
                  Remove
                </Button>
              ) : null}
              {isHost && seat.userId && !seat.host ? (
                <Button
                  variant="ghost"
                  size="md"
                  aria-label={`Remove @${seat.name}`}
                  onClick={() => send({ t: "kick", seat: seat.index })}
                >
                  <X size={18} aria-hidden="true" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {isHost && filled < snap.room.size ? (
          <p className="mt-2 px-1 text-sm text-ink-2">
            Tap Easy, Medium or Hard to put a bot in an empty seat.
          </p>
        ) : null}
      </section>

      <section
        aria-labelledby="rules-h"
        className="flex items-start gap-3 rounded-card border border-line bg-surface px-4 py-3 text-sm shadow-sm"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <h2 id="rules-h" className="font-semibold">
            {GAME_NAMES[snap.room.game]}
          </h2>
          <p className="text-ink-2">{describeRules(snap.room.game, snap.room.rules)}</p>
          {hasFirstPlayer(snap.room.game) ? (
            <p className="text-ink-2">Goes first: {FIRST_PLAYER[firstPlayer].short}</p>
          ) : null}
        </div>
        {isHost ? (
          <Button variant="secondary" size="md" onClick={() => setEditing(true)}>
            <Pencil size={15} aria-hidden="true" /> Edit
          </Button>
        ) : null}
      </section>

      {notice === "NOT_ENOUGH_PLAYERS" ? (
        <Alert>Add a bot or wait for a friend to join first.</Alert>
      ) : null}
      {notice === "TOO_MANY_PLAYERS" ? (
        <Alert>There are more people in the room than that game or seat count allows.</Alert>
      ) : null}

      {/* Mounted only while open, so it always starts from the room's current setup. */}
      {editing ? (
        <CreateRoomSheet
          open
          onClose={() => setEditing(false)}
          edit={{
            initial: {
              game: snap.room.game as CreatableGame,
              rules: snap.room.rules,
              players: snap.room.size,
              botLevel: snap.room.botFill,
              firstPlayer,
            },
            seated: people,
            onSave: (s) => send({ t: "config", ...s }),
          }}
        />
      ) : null}

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-paper/95 px-4 py-4 backdrop-blur">
        {isHost ? (
          <Button block onClick={() => send({ t: "start" })} disabled={!canStart}>
            {startLabel}
          </Button>
        ) : (
          <p className="py-3 text-center font-semibold text-ink-2">
            Waiting for {host ? `@${host.name}` : "the host"} to start…
          </p>
        )}
      </div>
    </div>
  );
}
