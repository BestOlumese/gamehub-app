"use client";

import { Spinner } from "@gamehub/ui/forms/spinner";
import { buttonClasses } from "@gamehub/ui/forms/button";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef } from "react";
import type { ClientTournamentMsg } from "@gamehub/protocol";
import { connectTournament, type TournamentConnection } from "@/lib/tournament/socket";
import { resetChat } from "@/lib/chat/store";
import { resetTournament, useTournament } from "@/lib/tournament/store";
import { TableReadySheet } from "./table-ready-sheet";
import { TournamentBracket } from "./tournament-bracket";
import { TournamentLobby } from "./tournament-lobby";

const ChatDock = dynamic(() => import("../chat/chat-dock"));

export function TournamentScreen({
  code,
  meId,
  soundOn,
}: {
  code: string;
  meId: string;
  soundOn: boolean;
}) {
  const conn = useRef<TournamentConnection | null>(null);
  const snap = useTournament((s) => s.snap);
  const go = useTournament((s) => s.go);
  const notice = useTournament((s) => s.notice);
  const connection = useTournament((s) => s.connection);

  useEffect(() => {
    resetTournament();
    resetChat();
    const c = connectTournament(code);
    conn.current = c;
    return () => {
      c.close();
      conn.current = null;
    };
  }, [code]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => useTournament.setState({ notice: null }), 8000);
    return () => clearTimeout(id);
  }, [notice]);

  const send = useCallback((m: ClientTournamentMsg) => conn.current?.send(m), []);
  const phase = snap?.state.phase;
  const sound = useCallback(() => soundOn, [soundOn]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between gap-2 bg-surface px-2 sm:px-4">
        <Link
          href="/home"
          className="flex items-center gap-1 rounded-control px-2 py-2 text-sm font-semibold text-ink-2 hover:bg-surface-2"
        >
          <ChevronLeft size={18} aria-hidden="true" /> Home
        </Link>
        <div className="flex items-center gap-2 font-display font-bold tracking-[0.15em] tabular-nums">
          <span
            className={`size-2 rounded-full ${connection === "open" ? "bg-brand" : "bg-accent"}`}
            role="img"
            aria-label={connection === "open" ? "Connected" : "Reconnecting"}
          />
          {code}
        </div>
        <span className="w-16" />
      </header>
      <div aria-hidden="true" className="strip" />
      {connection === "closed" || phase === "cancelled" ? (
        <div className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
          <p className="font-display text-2xl font-extrabold">This tournament has closed</p>
          <p className="text-ink-2">It was cancelled, or it ended a while ago.</p>
          <Link href="/home" className={buttonClasses("primary", "lg")}>
            Back home
          </Link>
        </div>
      ) : !snap ? (
        <div className="flex flex-1 items-center justify-center gap-3 text-ink-2" role="status">
          <Spinner /> Opening tournament {code}…
        </div>
      ) : phase === "lobby" ? (
        <TournamentLobby snap={snap} send={send} />
      ) : (
        <TournamentBracket snap={snap} send={send} />
      )}
      {snap && phase !== "cancelled" ? (
        <ChatDock send={send} meId={meId} soundOn={sound} lift={phase === "lobby"} />
      ) : null}
      {snap && go && phase === "running" ? (
        <TableReadySheet
          key={go.code}
          state={snap.state}
          you={snap.you}
          go={go}
          onStay={() => useTournament.setState({ go: null })}
        />
      ) : null}
    </div>
  );
}
