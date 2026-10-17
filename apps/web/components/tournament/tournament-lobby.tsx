"use client";

import type { ClientTournamentMsg, TournamentConfig } from "@gamehub/protocol";
import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Alert } from "@gamehub/ui/forms/alert";
import { Button } from "@gamehub/ui/forms/button";
import { Dialog } from "@gamehub/ui/overlays/dialog";
import { Bot, Crown, Pencil, X } from "lucide-react";
import { useState } from "react";
import { InviteFriendsButton } from "@/components/presence/invite-sheet";
import { SharePanel } from "@/components/room/share-panel";
import type { TSnapshot } from "@/lib/tournament/store";
import { stageFlow, stageSummary, STAGE_GAMES, type StageSpec } from "@/lib/tournament/plan";
import { useTournament } from "@/lib/tournament/store";
import { TournamentSetup } from "./tournament-setup";

/** Before the start: the code to share, who's in, the plan, and Join / Start. */
export function TournamentLobby({
  snap,
  send,
}: {
  snap: TSnapshot;
  send: (m: ClientTournamentMsg) => void;
}) {
  const [editing, setEditing] = useState(false);
  const notice = useTournament((s) => s.notice);
  const t = snap.state;
  const c = t.config;
  const me = t.entrants.find((e) => e.id === snap.you);
  const isHost = !!me?.host;
  const joined = t.entrants.length;
  const open = c.entrants - joined;
  const stages = c.stages as StageSpec[];
  const { counts } = stageFlow(c.entrants, stages);
  const startLabel =
    open <= 0
      ? "Start tournament"
      : c.botFill
        ? `Start · bots take ${open} ${open === 1 ? "place" : "places"}`
        : "Waiting for players";

  return (
    <div className="mx-auto w-full max-w-lg space-y-6 px-4 py-6">
      <div>
        <h1 className="font-display text-2xl leading-tight font-extrabold tracking-tight">
          {c.name}
        </h1>
        <p className="text-ink-2">
          {c.entrants} players · {stages.length} {stages.length === 1 ? "stage" : "stages"}
          {c.botFill ? ` · bots fill the rest (${c.botFill})` : ""}
        </p>
      </div>

      <SharePanel code={t.code} gameName={c.name} kind="tournament" />
      <InviteFriendsButton
        kind="tournament"
        code={t.code}
        game={null}
        name={c.name}
        exclude={t.entrants.flatMap((e) => (e.userId ? [e.userId] : []))}
      />

      {notice ? (
        <Alert
          title={
            notice.code === "BAD_STAGES"
              ? "The plan doesn't work with this many players"
              : noticeText(notice.code)
          }
        >
          {notice.detail?.length ? (
            <ul className="list-disc pl-5">
              {notice.detail.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}

      <section aria-labelledby="plan-h">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 id="plan-h" className="text-sm font-semibold text-ink-2">
            The plan
          </h2>
          <span className="flex items-center gap-3">
            <span className="font-display font-bold text-brand tabular-nums">
              {counts.join(" → ")}
            </span>
            {isHost ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-sm font-semibold text-brand-strong hover:bg-brand-soft"
              >
                <Pencil size={15} aria-hidden="true" /> Edit
              </button>
            ) : null}
          </span>
        </div>
        <ol className="divide-y divide-line rounded-card border border-line bg-surface">
          {stages.map((s, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft font-display font-bold text-brand-strong">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{STAGE_GAMES[s.game].name}</span>
                <span className="block text-sm text-ink-2">
                  {stageSummary(s, counts[i] ?? 0, i === stages.length - 1)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="who-h">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 id="who-h" className="text-sm font-semibold text-ink-2">
            Players
          </h2>
          <span className="text-sm text-ink-2 tabular-nums">
            {joined}/{c.entrants}
          </span>
        </div>
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {t.entrants.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-3">
              <span className={e.online ? "" : "opacity-40 grayscale"}>
                <Avatar username={e.name} image={e.avatar} size={36} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate font-semibold">
                  @{e.name}
                  {e.host ? <Crown size={15} className="text-accent" aria-label="Host" /> : null}
                </span>
                <span className="text-sm text-ink-2">
                  {e.id === snap.you ? "You" : e.online ? "Here" : "Not here right now"}
                </span>
              </span>
              {isHost && !e.host ? (
                <button
                  type="button"
                  onClick={() => send({ t: "t_kick", entrant: e.id })}
                  className="grid size-10 place-items-center rounded-control text-ink-2 hover:bg-surface-2"
                  aria-label={`Remove @${e.name}`}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
          {open > 0 ? (
            <li className="flex items-center gap-3 px-4 py-3 text-ink-2">
              <span className="grid size-9 place-items-center rounded-full bg-surface-2">
                <Bot size={18} aria-hidden="true" />
              </span>
              {c.botFill
                ? `${open} more can join; bots take any places left at the start.`
                : `${open} more can join.`}
            </li>
          ) : null}
        </ul>
      </section>

      <div className="grid gap-2">
        {!me ? (
          <Button block disabled={open <= 0} onClick={() => send({ t: "t_join" })}>
            {open <= 0 ? "The tournament is full" : "Join tournament"}
          </Button>
        ) : isHost ? (
          <>
            <Button block disabled={open > 0 && !c.botFill} onClick={() => send({ t: "t_start" })}>
              {startLabel}
            </Button>
            <Button variant="secondary" block onClick={() => send({ t: "t_cancel" })}>
              Cancel tournament
            </Button>
          </>
        ) : (
          <Button variant="secondary" block onClick={() => send({ t: "t_leave" })}>
            Leave
          </Button>
        )}
        {me && !isHost ? (
          <p className="text-center text-sm text-ink-2">
            {c.autoStart ? "It starts by itself when every place is taken." : "The host starts it."}
          </p>
        ) : null}
      </div>

      {editing ? (
        <Dialog open onClose={() => setEditing(false)} title="Edit the plan">
          <TournamentSetup
            initial={c}
            joined={joined}
            submitLabel="Save changes"
            busyLabel="Saving"
            onSubmit={async (config: TournamentConfig) => {
              send({ t: "t_config", config });
              setEditing(false);
              return null;
            }}
          />
        </Dialog>
      ) : null}
    </div>
  );
}

function noticeText(code: string): string {
  switch (code) {
    case "TOURNAMENT_FULL":
      return "The tournament is full.";
    case "NOT_HOST":
      return "Only the host can do that.";
    case "TOO_MANY_PLAYERS":
      return "More people have joined than that plan has places for.";
    case "RATE_LIMIT":
      return "Slow down a little.";
    default:
      return "That didn't work. Try again.";
  }
}
