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
import dynamic from "next/dynamic";

// Each game's table is its own chunk (docs/10-performance.md: ≤ 60 KB per game).
const TttTable = dynamic(() => import("./ttt-table").then((m) => m.TttTable));
const RpsTable = dynamic(() => import("./rps/rps-table"));
const WhotTable = dynamic(() => import("./whot/whot-table"));
const LudoTable = dynamic(() => import("./ludo/ludo-table"));
const SnakesTable = dynamic(() => import("./snakes/snakes-table"));
const ChessTable = dynamic(() => import("./chess/chess-table"));
const DraughtsTable = dynamic(() => import("./draughts/draughts-table"));

export function RoomScreen({ code, soundOn }: { code: string; soundOn: boolean }) {
  const router = useRouter();
  const conn = useRef<RoomConnection | null>(null);
  const snap = useRoom((s) => s.snap);
  const closedCode = useRoom((s) => s.closedCode);
  const notice = useRoom((s) => s.notice);

  useEffect(() => {
    resetRoom();
    useRoom.setState({ soundOn });
    const c = connectRoom(code);
    conn.current = c;
    return () => {
      c.close();
      conn.current = null;
    };
  }, [code, soundOn]);

  // Notices (like "not enough players") fade after a few seconds.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => useRoom.setState({ notice: null }), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const send = useCallback((m: ClientRoomMsg) => conn.current?.send(m), []);
  const leave = useCallback(() => {
    send({ t: "leave" });
    router.push("/home");
  }, [send, router]);

  if (closedCode !== null) return <RoomClosed code={closedCode} />;

  const playing = snap?.room.phase === "playing";
  return (
    <div className="flex min-h-dvh flex-col">
      <RoomTopBar
        code={code}
        menu={
          <RoomMenu
            code={code}
            game={snap?.room.game ?? null}
            rules={snap?.room.rules}
            soundOn={soundOn}
            playing={playing}
            onLeave={leave}
          />
        }
      />
      <ConnectionBanner />
      {!snap ? (
        <div className="flex flex-1 items-center justify-center gap-3 text-ink-2" role="status">
          <Spinner /> Joining room {code}…
        </div>
      ) : snap.room.phase === "lobby" ? (
        <Lobby snap={snap} send={send} notice={notice} />
      ) : snap.room.game === "rps" ? (
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
      ) : (
        <TttTable snap={snap} send={send} />
      )}
    </div>
  );
}
