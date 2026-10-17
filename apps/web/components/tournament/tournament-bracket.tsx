"use client";

import type { ClientTournamentMsg, EntrantPublic, TablePublic } from "@gamehub/protocol";
import { buttonClasses } from "@gamehub/ui/forms/button";
import { Button } from "@gamehub/ui/forms/button";
import { Check, Eye, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  isKnockout,
  nameOf,
  placeLabel,
  roundName,
  stageTitle,
  statusOf,
} from "@/lib/tournament/labels";
import type { TSnapshot } from "@/lib/tournament/store";

/** During and after: your status, the stages as tabs, each stage's tables, the final places. */
export function TournamentBracket({
  snap,
  send,
}: {
  snap: TSnapshot;
  send: (m: ClientTournamentMsg) => void;
}) {
  const t = snap.state;
  const [tab, setTab] = useState<number | null>(null);
  const stage = tab ?? t.stage;
  const status = statusOf(t, snap.you);
  const byId = new Map(t.entrants.map((e) => [e.id, e]));
  const me = byId.get(snap.you);
  const tables = t.tables.filter((x) => x.stage === stage);
  const spec = t.config.stages[stage];
  const finished = t.phase === "finished";

  return (
    <div className="mx-auto w-full max-w-lg space-y-5 px-4 py-6">
      <div>
        <h1 className="font-display text-2xl leading-tight font-extrabold tracking-tight">
          {t.config.name}
        </h1>
        <p className="text-ink-2">
          {finished
            ? "Finished"
            : `Stage ${t.stage + 1} of ${t.config.stages.length} · ${stageTitle(t, t.stage)}`}
        </p>
      </div>

      <section
        aria-live="polite"
        className={`rounded-card border p-4 ${finished ? "border-accent/40 bg-accent-soft" : "border-brand/30 bg-brand-soft"}`}
      >
        <p className="flex items-center gap-2 font-display text-lg font-extrabold">
          {finished ? <Trophy size={20} aria-hidden="true" className="text-accent" /> : null}
          {status.title}
        </p>
        <p className="text-sm text-ink-2">{status.detail}</p>
        {status.table?.code ? (
          <Link
            href={`/r/${status.table.code}`}
            className={buttonClasses("primary", "md", "mt-3 w-full")}
          >
            Go to your table
          </Link>
        ) : null}
      </section>

      {finished && t.placements ? <Standings snap={snap} byId={byId} /> : null}

      <div role="tablist" aria-label="Stages" className="flex gap-1.5 overflow-x-auto pb-1">
        {t.config.stages.map((s, i) => {
          const started = t.tables.some((x) => x.stage === i);
          return (
            <button
              key={i}
              role="tab"
              type="button"
              aria-selected={stage === i}
              disabled={!started}
              onClick={() => setTab(i)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors duration-(--dur-press) disabled:opacity-40 ${stage === i ? "border-brand bg-brand text-white" : "border-line bg-surface hover:border-ink-3"}`}
            >
              {i + 1} {stageTitle(t, i)}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="space-y-4">
        {spec && isKnockout(spec) ? (
          <Knockout tables={tables} byId={byId} you={snap.you} />
        ) : (
          tables.map((x) => <TableCard key={x.id} table={x} byId={byId} you={snap.you} />)
        )}
      </div>

      {me && me.status === "in" && !finished ? (
        <Button variant="secondary" block onClick={() => send({ t: "t_leave" })}>
          Leave tournament
        </Button>
      ) : null}
    </div>
  );
}

function Who({ e, you }: { e: EntrantPublic | undefined; you: string }) {
  return (
    <span className={`truncate ${e?.id === you ? "font-bold text-brand-strong" : ""}`}>
      {e?.id === you ? "You" : nameOf(e)}
    </span>
  );
}

function TableHead({ table, label }: { table: TablePublic; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
      <span className="text-sm font-semibold">{label}</span>
      {table.status === "done" ? (
        <span className="text-xs font-semibold text-ink-2">{table.bye ? "Bye" : "Done"}</span>
      ) : table.code ? (
        <Link
          href={`/r/${table.code}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-bold text-danger"
        >
          <span className="size-1.5 rounded-full bg-danger" aria-hidden="true" /> Live
          <Eye size={13} aria-hidden="true" />
          <span className="sr-only">Watch</span>
        </Link>
      ) : (
        <span className="text-xs font-semibold text-ink-2">Setting up</span>
      )}
    </div>
  );
}

/** A table of 3 or more: its finishing order once done, with ticks for who went through. */
function TableCard({
  table,
  byId,
  you,
}: {
  table: TablePublic;
  byId: Map<string, EntrantPublic>;
  you: string;
}) {
  const order = table.ranking ?? [table.seats];
  // Each group's place: one after everyone above it (ties share it).
  const places = order.map((_, k) => 1 + order.slice(0, k).reduce((n, g) => n + g.length, 0));
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <TableHead table={table} label={`Table ${table.index + 1}`} />
      <ol className="divide-y divide-line">
        {order.map((group, k) => {
          const place = places[k] ?? 1;
          return group.map((id) => (
            <li key={id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="w-8 shrink-0 text-ink-2 tabular-nums">
                {table.ranking ? placeLabel(place, group.length > 1) : ""}
              </span>
              <Who e={byId.get(id)} you={you} />
              {table.through?.includes(id) ? (
                <Check
                  size={16}
                  className="ml-auto shrink-0 text-brand"
                  aria-label="Went through"
                />
              ) : null}
            </li>
          ));
        })}
      </ol>
      {table.coin ? (
        <p className="border-t border-line px-4 py-2 text-xs text-ink-2">
          A tie decided by coin toss.
        </p>
      ) : null}
    </div>
  );
}

/** A knockout stage: rounds in order, one row per match. */
function Knockout({
  tables,
  byId,
  you,
}: {
  tables: TablePublic[];
  byId: Map<string, EntrantPublic>;
  you: string;
}) {
  const rounds = [...new Set(tables.map((x) => x.round))].sort((a, b) => b - a);
  return (
    <>
      {rounds.map((r) => {
        const inRound = tables.filter((x) => x.round === r).sort((a, b) => a.index - b.index);
        return (
          <section key={r} className="overflow-hidden rounded-card border border-line bg-surface">
            <h3 className="border-b border-line bg-surface-2 px-4 py-2 text-sm font-bold">
              {roundName(inRound.length)}
            </h3>
            <ul className="divide-y divide-line">
              {inRound.map((x) => (
                <li key={x.id} className="px-4 py-2.5 text-sm">
                  {x.bye ? (
                    <p className="flex items-center gap-2">
                      <Who e={byId.get(x.seats[0] ?? "")} you={you} />
                      <span className="ml-auto text-xs text-ink-2">Bye, straight through</span>
                    </p>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        {x.seats.map((id) => (
                          <p key={id} className="flex items-center gap-2">
                            <Who e={byId.get(id)} you={you} />
                            {x.through?.includes(id) ? (
                              <Check size={15} className="shrink-0 text-brand" aria-label="Won" />
                            ) : null}
                          </p>
                        ))}
                      </div>
                      {x.status !== "done" && x.code ? (
                        <Link
                          href={`/r/${x.code}`}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-bold text-danger"
                        >
                          <span className="size-1.5 rounded-full bg-danger" aria-hidden="true" />{" "}
                          Live
                        </Link>
                      ) : x.coin ? (
                        <span className="shrink-0 text-xs text-ink-2">Coin toss</span>
                      ) : null}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

function Standings({ snap, byId }: { snap: TSnapshot; byId: Map<string, EntrantPublic> }) {
  const places = snap.state.placements ?? [];
  const count = (p: number) => places.filter((x) => x.place === p).length;
  const top = places.filter((p) => p.place <= 8 || p.entrant === snap.you);
  return (
    <section
      aria-labelledby="standings-h"
      className="overflow-hidden rounded-card border border-line bg-surface"
    >
      <h2
        id="standings-h"
        className="border-b border-line bg-surface-2 px-4 py-2 text-sm font-bold"
      >
        Final places
      </h2>
      <ol className="divide-y divide-line">
        {top.map((p) => (
          <li key={p.entrant} className="flex items-center gap-3 px-4 py-2 text-sm">
            <span className="w-10 shrink-0 font-semibold tabular-nums">
              {placeLabel(p.place, count(p.place) > 1)}
            </span>
            <Who e={byId.get(p.entrant)} you={snap.you} />
            {p.place === 1 ? (
              <Trophy size={16} className="ml-auto text-accent" aria-label="Champion" />
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
