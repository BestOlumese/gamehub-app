"use client";

import type { GameSlug } from "@gamehub/engine";
import type { QueueSpecMsg, ServerMatchMsg } from "@gamehub/protocol";
import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Button, buttonClasses } from "@gamehub/ui/forms/button";
import { Spinner } from "@gamehub/ui/forms/spinner";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Toggle } from "@/components/create-room/rule-controls";
import { ArtImage, type ArtName } from "@/components/site/art-image";
import { GAME_NAMES } from "@/lib/game-meta";
import { connectQueue } from "@/lib/quick/socket";

type State = Extract<ServerMatchMsg, { t: "mm_state" }>;

/** Waiting for players: seats filling, when bots come, keep waiting, cancel. Into the room when found. */
export function QueueScreen({ spec }: { spec: QueueSpecMsg }) {
  const router = useRouter();
  const conn = useRef<ReturnType<typeof connectQueue> | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const c = connectQueue(
      spec,
      (m) => {
        if (m.t === "mm_state") {
          setState(m);
          setOffset(m.serverNow - Date.now());
        } else if (m.t === "mm_go") router.push(`/r/${m.code}`);
      },
      setOpen,
    );
    conn.current = c;
    return () => c.close();
  }, [spec, router]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);

  const name = GAME_NAMES[spec.game as GameSlug];
  const cancel = () => {
    conn.current?.leave();
    router.push("/home");
  };
  const secs = (at: number) => Math.max(0, Math.ceil((at - (now + offset)) / 1000));
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center bg-surface px-2 sm:px-4">
        <button
          type="button"
          onClick={cancel}
          className="flex items-center gap-1 rounded-control px-2 py-2 text-sm font-semibold text-ink-2 hover:bg-surface-2"
        >
          <ChevronLeft size={18} aria-hidden="true" /> Cancel
        </button>
      </header>
      <div aria-hidden="true" className={`tone-${spec.game} h-1.5 bg-(--g)`} />
      <main className={`tone-${spec.game} cloth relative w-full flex-1 px-4 py-10 text-center`}>
        <span aria-hidden="true" className="pat absolute inset-0" style={{ opacity: 0.07 }} />
        <div className="relative mx-auto max-w-md space-y-6">
          {state?.status === "busy" ? (
            <>
              <p className="font-display text-2xl font-extrabold">You&apos;re already in a game</p>
              <p className="text-ink-2">One game at a time. Finish that one first.</p>
              <Link href={`/r/${state.code}`} className={buttonClasses("primary", "lg", "w-full")}>
                Back to your game
              </Link>
            </>
          ) : state?.status === "timed_out" ? (
            <>
              <p className="font-display text-2xl font-extrabold">Nobody came this time</p>
              <p className="text-ink-2">We waited 3 minutes. Try again, or let bots fill in.</p>
              <Button block onClick={() => window.location.reload()}>
                Try again
              </Button>
              <Link href="/home" className={buttonClasses("secondary", "lg", "w-full")}>
                Back home
              </Link>
            </>
          ) : (
            <>
              <div>
                <h1 className="font-display text-2xl font-extrabold tracking-tight">
                  Finding players · {name}
                </h1>
                <p className="mt-1 text-ink-2" aria-live="polite">
                  {state?.status === "queued"
                    ? `${state.found.length} of ${state.size} found`
                    : open
                      ? "Joining the queue…"
                      : "Connecting…"}
                </p>
              </div>
              <div className="flex justify-center py-2">
                <ArtImage
                  name={`game-${spec.game}` as ArtName}
                  className="h-24 w-auto animate-bounce [animation-duration:1.6s] motion-reduce:animate-none"
                />
              </div>
              <div className="flex justify-center">
                <Spinner />
              </div>
              {state?.status === "queued" ? (
                <>
                  <ul className="flex flex-wrap justify-center gap-3" aria-label="Players found">
                    {Array.from({ length: state.size }, (_, i) => {
                      const p = state.found[i];
                      return (
                        <li key={i} className="flex w-16 flex-col items-center gap-1 text-xs">
                          {p ? (
                            <Avatar username={p.name} image={p.avatar} size={44} />
                          ) : (
                            <span className="size-11 rounded-full border-2 border-dashed border-line" />
                          )}
                          <span className="w-full truncate">
                            {p ? (p.you ? "You" : `@${p.name}`) : "…"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-sm text-ink-2" aria-live="polite">
                    {state.botsAt !== null
                      ? `Bots join in ${clock(secs(state.botsAt))}${state.ranked ? " (the game won't be ranked)" : ""}`
                      : state.giveUpAt !== null
                        ? `Waiting for people only, up to ${clock(secs(state.giveUpAt))} more`
                        : ""}
                  </p>
                  <div className="tile text-left">
                    <Toggle
                      label="Keep waiting for players"
                      hint="No bots: wait up to 3 minutes for people."
                      checked={state.botsAt === null}
                      onChange={(keep) => conn.current?.keepWaiting(keep)}
                    />
                  </div>
                </>
              ) : null}
              <Button variant="secondary" block onClick={cancel}>
                Cancel
              </Button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
