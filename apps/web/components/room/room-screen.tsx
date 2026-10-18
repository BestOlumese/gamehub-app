"use client";

import type { ClientRoomMsg } from "@gamehub/protocol";
import { Spinner } from "@gamehub/ui/forms/spinner";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { connectRoom, type RoomConnection } from "@/lib/room/socket";
import { resetRoom, useRoom } from "@/lib/room/store";
import { ConnectionBanner } from "./connection-banner";
import { Lobby } from "./lobby";
import { RoomClosed } from "./room-closed";
import { RoomMenu } from "./room-menu";
import { RoomTopBar } from "./room-top-bar";
import { WatchingBar } from "./watching-bar";
import { playAgainHref, QuickStrip, TableDone, TableStrip, TableWaiting } from "./tournament-table";
import dynamic from "next/dynamic";
import { resetChat, useChat } from "@/lib/chat/store";

// Each game's table is its own chunk (docs/10-performance.md: ≤ 60 KB per game).
const TttTable = dynamic(() => import("./ttt-table").then((m) => m.TttTable));
const RpsTable = dynamic(() => import("./rps/rps-table"));
const WhotTable = dynamic(() => import("./whot/whot-table"));
const LudoTable = dynamic(() => import("./ludo/ludo-table"));
const SnakesTable = dynamic(() => import("./snakes/snakes-table"));
const ChessTable = dynamic(() => import("./chess/chess-table"));
const DraughtsTable = dynamic(() => import("./draughts/draughts-table"));
const PlotsTable = dynamic(() => import("./plots/plots-table"));
const FootballTable = dynamic(() => import("./football/football-table"));
const ChatDock = dynamic(() => import("../chat/chat-dock"));
const soundOn = () => useRoom.getState().soundOn;

export function RoomScreen({
  code,
  meId,
  soundOn: initialSound,
}: {
  code: string;
  meId: string;
  soundOn: boolean;
}) {
  const router = useRouter();
  const conn = useRef<RoomConnection | null>(null);
  const snap = useRoom((s) => s.snap);
  const closedCode = useRoom((s) => s.closedCode);
  const notice = useRoom((s) => s.notice);
  // The host turned chat off, or a quick-match spectator (no chat for them).
  const chatOff = snap?.room.chat === false || (!!snap?.room.quick && snap.you === "spectator");
  useEffect(() => {
    if (snap) useChat.setState({ off: chatOff });
  }, [snap, chatOff]);

  useEffect(() => {
    resetRoom();
    resetChat();
    useRoom.setState({ soundOn: initialSound });
    const c = connectRoom(code);
    conn.current = c;
    return () => {
      c.close();
      conn.current = null;
    };
  }, [code, initialSound]);

  // Notices (like "not enough players") fade after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => useRoom.setState({ notice: null }), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const send = useCallback(
    (m: ClientRoomMsg) => {
      // Quick match has no rematch: the button finds new players in the same queue.
      const snapNow = useRoom.getState().snap;
      if (m.t === "rematch" && snapNow?.room.quick) {
        router.push(playAgainHref(snapNow));
        return;
      }
      conn.current?.send(m);
    },
    [router],
  );
  const leave = useCallback(() => {
    send({ t: "leave" });
    router.push("/home");
  }, [send, router]);

  if (closedCode !== null) return <RoomClosed code={closedCode} />;

  const playing = snap?.room.phase === "playing";
  const tour = snap?.room.tournament;
  // At the table (playing, or the result over the final board), chat lives in the top bar so
  // it never covers the game's own controls; in the lobby it floats bottom right.
  const atTable = !!snap && snap.room.phase !== "lobby";
  const chat =
    snap && !chatOff ? (
      <ChatDock send={send} meId={meId} soundOn={soundOn} inBar={atTable} lift={!atTable} />
    ) : null;
  return (
    <div className="flex min-h-dvh flex-col">
      <RoomTopBar
        code={code}
        {...(tour ? { back: { href: `/t/${tour.code}`, label: "Tournament" } } : {})}
        menu={
          <div className="flex items-center">
            {atTable ? chat : null}
            <RoomMenu
              code={code}
              game={snap?.room.game ?? null}
              rules={snap?.room.rules}
              soundOn={initialSound}
              playing={playing}
              onLeave={leave}
            />
          </div>
        }
      />
      <ConnectionBanner />
      {atTable ? null : chat}
      {snap && tour ? <TableStrip tour={tour} snap={snap} /> : null}
      {snap?.room.quick ? <QuickStrip snap={snap} /> : null}
      {snap && snap.you === "spectator" ? <WatchingBar snap={snap} /> : null}
      {snap && tour && snap.room.phase === "ended" ? <TableDone tour={tour} snap={snap} /> : null}
      {!snap ? (
        <div className="flex flex-1 items-center justify-center gap-3 text-ink-2" role="status">
          <Spinner /> Joining room {code}…
        </div>
      ) : snap.room.phase === "lobby" ? (
        tour || snap.room.quick ? (
          <TableWaiting
            tour={tour ?? { startsAt: snap.room.quick?.startsAt ?? null }}
            snap={snap}
          />
        ) : (
          <Lobby snap={snap} send={send} notice={notice} />
        )
      ) : (
        // The table cloth: the game's colour with its pattern, faint, under everything.
        <div className={`tone-${snap.room.game} cloth relative flex flex-1 flex-col`}>
          <span aria-hidden="true" className="pat absolute inset-0" style={{ opacity: 0.07 }} />
          <div className="relative flex flex-1 flex-col">
            {snap.room.game === "rps" ? (
              <RpsTable snap={snap} send={send} />
            ) : snap.room.game === "whot" ? (
              <WhotTable snap={snap} send={send} />
            ) : snap.room.game === "ludo" ? (
              <LudoTable snap={snap} send={send} />
            ) : snap.room.game === "snakes" ? (
              <SnakesTable snap={snap} send={send} />
            ) : snap.room.game === "chess" ? (
              <ChessTable snap={snap} send={send} />
            ) : snap.room.game === "draughts" ? (
              <DraughtsTable snap={snap} send={send} />
            ) : snap.room.game === "plots" ? (
              <PlotsTable snap={snap} send={send} />
            ) : snap.room.game === "football" ? (
              <FootballTable snap={snap} send={send} />
            ) : (
              <TttTable snap={snap} send={send} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
