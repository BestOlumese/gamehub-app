"use client";

import {
  CHAT_MAX,
  EMOTES,
  REPORT_REASONS,
  type ChatErrorCode,
  type ClientRoomMsg,
  type EmoteId,
  type ReportReason,
} from "@gamehub/protocol";
import { Button } from "@gamehub/ui/forms/button";
import { Input } from "@gamehub/ui/forms/input";
import { Dialog } from "@gamehub/ui/overlays/dialog";
import { MessageCircle, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { blockUser } from "@/app/(app)/friends/actions";
import { hidePerson, setChatOpen, useChat, type ChatItem } from "@/lib/chat/store";
import { sfx } from "../room/sounds";

export type ChatOut = Extract<ClientRoomMsg, { t: "chat" | "emote" | "report" }>;

/** Emotes with a recorded clip in /public/sounds/voice/<id>.webm; the rest play a soft pop. */
const VOICE_CLIPS: readonly EmoteId[] = [];

const EMOTE_LABEL = new Map<string, string>(EMOTES.map((e) => [e.id, e.label]));

const REASON_LABEL: Record<ReportReason, string> = {
  abuse: "Insults or bullying",
  hate: "Hate",
  sexual: "Sexual",
  spam: "Spam",
  cheating: "Cheating",
  other: "Something else",
};

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });

function errorText(code: ChatErrorCode, until?: number): string {
  switch (code) {
    case "LINK":
      return "Links aren't allowed.";
    case "SLOW":
      return "Slow down a little.";
    case "MUTED":
      return until ? `Chat is off for you until ${clock(until)}.` : "Chat is off for you.";
    case "OFF":
      return "The host turned chat off.";
    case "REPORTED":
      return "Report sent. Thanks.";
    case "BAD_REPORT":
      return "Couldn't send that report.";
  }
}

function playEmote(id: EmoteId) {
  if (!VOICE_CLIPS.includes(id)) return sfx.pop();
  const a = new Audio(`/sounds/voice/${id}.webm`);
  a.volume = 0.8;
  a.play().catch(() => sfx.pop());
}

/** The round chat button (bottom right), its sheet, and 3-second bubbles at the top. */
export default function ChatDock({
  send,
  meId,
  soundOn,
  lift = false,
  inBar = false,
}: {
  send: (m: ChatOut) => void;
  meId: string;
  soundOn: () => boolean;
  /** Sits above a sticky bottom bar (the lobby's Start, a result sheet). */
  lift?: boolean;
  /** In the room's top bar (during a game) instead of floating. */
  inBar?: boolean;
}) {
  const open = useChat((s) => s.open);
  const unread = useChat((s) => s.unread);
  const lastEmote = useChat((s) => s.lastEmote);

  useEffect(() => {
    if (lastEmote && soundOn()) playEmote(lastEmote.emote);
  }, [lastEmote, soundOn]);

  return (
    <>
      <Bubbles />
      <button
        type="button"
        onClick={() => setChatOpen(true)}
        aria-label={unread ? `Chat, ${unread} new` : "Chat"}
        className={
          inBar
            ? "relative flex size-10 items-center justify-center rounded-control hover:bg-surface-2"
            : `fixed right-4 z-30 grid size-12 place-items-center rounded-full border border-line bg-surface text-ink shadow-md transition-[bottom] duration-(--dur-sheet) hover:bg-surface-2 ${
                lift
                  ? "bottom-[calc(env(safe-area-inset-bottom)+6.5rem)]"
                  : "bottom-[calc(env(safe-area-inset-bottom)+1rem)]"
              }`
        }
      >
        <MessageCircle size={inBar ? 20 : 22} aria-hidden="true" />
        {unread ? (
          <span
            className={`absolute rounded-full border-2 border-surface bg-danger ${inBar ? "top-1.5 right-1.5 size-2.5" : "top-0.5 right-0.5 size-3"}`}
            aria-hidden="true"
          />
        ) : null}
      </button>
      <Dialog open={open} onClose={() => setChatOpen(false)} title="Chat">
        <ChatSheet send={send} meId={meId} />
      </Dialog>
    </>
  );
}

function Bubbles() {
  const items = useChat((s) => s.items);
  const bubbles = useChat((s) => s.bubbles);
  const open = useChat((s) => s.open);
  if (open) return null;
  const live = items.filter((i) => bubbles.includes(i.key)).slice(-3);
  if (!live.length) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-16 z-30 flex flex-col items-center gap-1.5 px-4"
    >
      {live.map((i) => (
        <p
          key={i.key}
          className="max-w-sm truncate rounded-full border border-line bg-surface px-3 py-1.5 text-sm shadow-sm"
        >
          <span className="font-semibold">{i.from.name}</span>{" "}
          {i.kind === "line" ? i.text : (EMOTE_LABEL.get(i.emote) ?? i.emote)}
        </p>
      ))}
    </div>
  );
}

function ChatSheet({ send, meId }: { send: (m: ChatOut) => void; meId: string }) {
  const items = useChat((s) => s.items);
  const mutedUntil = useChat((s) => s.mutedUntil);
  const off = useChat((s) => s.off);
  const error = useChat((s) => s.error);
  const [text, setText] = useState("");
  const [person, setPerson] = useState<ChatItem | null>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [items.length, person]);

  const showError = error;

  if (person)
    return (
      <PersonPanel
        item={person}
        onDone={() => setPerson(null)}
        onReport={(reason) => {
          send({
            t: "report",
            target: person.from.userId,
            reason,
            ...(person.kind === "line"
              ? { line: { text: person.text, ts: person.ts, sig: person.sig } }
              : {}),
          });
          setPerson(null);
        }}
      />
    );

  const blocked = off
    ? "The host turned chat off."
    : mutedUntil
      ? `Chat is off for you until ${clock(mutedUntil)}.`
      : null;

  return (
    <div className="space-y-3">
      <div
        ref={list}
        role="log"
        aria-label="Messages"
        className="max-h-[42dvh] min-h-32 space-y-2 overflow-y-auto rounded-control bg-surface-2 p-3"
      >
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-3">No messages yet. Say hi.</p>
        ) : (
          items.map((i) => (
            <p key={i.key} className="text-sm leading-snug">
              {i.from.userId === meId ? (
                <span className="font-semibold text-brand">You</span>
              ) : (
                <button
                  type="button"
                  onClick={() => setPerson(i)}
                  className="font-semibold underline-offset-2 hover:underline"
                >
                  {i.from.name}
                </button>
              )}{" "}
              {i.kind === "line" ? (
                <span className="break-words">{i.text}</span>
              ) : (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 font-semibold">
                  {EMOTE_LABEL.get(i.emote) ?? i.emote}
                </span>
              )}
            </p>
          ))
        )}
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Emotes">
        {EMOTES.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => send({ t: "emote", id: e.id })}
            className="shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-surface-2"
          >
            {e.label}
          </button>
        ))}
      </div>

      {blocked ? (
        <p className="rounded-control bg-surface-2 px-3 py-3 text-sm text-ink-2">{blocked}</p>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const t = text.trim();
            if (!t) return;
            send({ t: "chat", text: t });
            setText("");
          }}
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={CHAT_MAX}
            placeholder="Type a message"
            aria-label="Message"
            enterKeyHint="send"
            autoComplete="off"
          />
          <Button type="submit" size="lg" aria-label="Send" disabled={!text.trim()}>
            <Send size={18} aria-hidden="true" />
          </Button>
        </form>
      )}
      {showError ? (
        <p
          role="status"
          className={`text-sm ${showError.code === "REPORTED" ? "text-brand" : "text-danger-strong"}`}
        >
          {errorText(showError.code, showError.until)}
        </p>
      ) : null}
    </div>
  );
}

function PersonPanel({
  item,
  onDone,
  onReport,
}: {
  item: ChatItem;
  onDone: () => void;
  onReport: (r: ReportReason) => void;
}) {
  const [step, setStep] = useState<"menu" | "report">("menu");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [busy, setBusy] = useState(false);
  const { userId, name } = item.from;

  if (step === "report")
    return (
      <div className="space-y-4">
        <div>
          <p className="font-bold">Report {name}</p>
          {item.kind === "line" ? (
            <p className="mt-1 rounded-control bg-surface-2 px-3 py-2 text-sm">“{item.text}”</p>
          ) : null}
          <p className="mt-2 text-sm text-ink-2">What&apos;s wrong? A moderator will look at it.</p>
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Reason">
          {REPORT_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              onClick={() => setReason(r)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                reason === r
                  ? "border-brand bg-brand-soft text-brand-strong"
                  : "border-line bg-surface hover:bg-surface-2"
              }`}
            >
              {REASON_LABEL[r]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="md" onClick={onDone}>
            Cancel
          </Button>
          <Button size="md" disabled={!reason} onClick={() => reason && onReport(reason)}>
            Send report
          </Button>
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <p className="font-bold">{name}</p>
      <div className="grid gap-2">
        <Button
          variant="secondary"
          size="md"
          onClick={() => {
            hidePerson(userId);
            onDone();
          }}
        >
          Mute in this game
        </Button>
        <Button
          variant="secondary"
          size="md"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await blockUser(userId).catch(() => null);
            hidePerson(userId);
            onDone();
          }}
        >
          Block
        </Button>
        <Button variant="danger-outline" size="md" onClick={() => setStep("report")}>
          Report…
        </Button>
        <Button variant="ghost" size="md" onClick={onDone}>
          Back
        </Button>
      </div>
    </div>
  );
}
