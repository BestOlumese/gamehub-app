"use client";

import type { FriendStatus } from "@gamehub/protocol";
import { Avatar } from "@gamehub/ui/data-display/avatar";
import { Alert } from "@gamehub/ui/forms/alert";
import { Button, buttonClasses } from "@gamehub/ui/forms/button";
import { Input } from "@gamehub/ui/forms/input";
import { Eye } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  acceptFriend,
  addFriend,
  dropRequest,
  type FriendResult,
} from "@/app/(app)/friends/actions";
import { GAME_NAMES } from "@/lib/game-meta";
import { usePresence, type Friend } from "@/lib/presence/store";

/** "In Ludo", "In a tournament", "Online", "Offline". */
export function statusText(s: FriendStatus | undefined): string {
  if (!s?.online && !s?.inGame) return "Offline";
  if (s.inGame) return `In ${GAME_NAMES[s.inGame.game]}`;
  if (s.inTournament) return "In a tournament";
  return "Online";
}

export function watchHref(f: Friend, s: FriendStatus | undefined): string | null {
  if (s?.inGame) return `/r/${s.inGame.code}?watch=${encodeURIComponent(f.username)}`;
  if (s?.inTournament) return `/t/${s.inTournament.code}`;
  return null;
}

function Row({ f, children }: { f: Friend; children?: React.ReactNode }) {
  const s = usePresence((x) => x.statuses[f.id]);
  const on = !!s?.online;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="relative">
        <Avatar username={f.username} image={f.image} size={40} />
        <span
          className={`absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-surface ${on ? "bg-brand" : "bg-line"}`}
          aria-hidden="true"
        />
      </span>
      <span className="min-w-0 flex-1">
        <Link href={`/u/${f.username}`} className="block truncate font-semibold hover:underline">
          @{f.username}
        </Link>
        <span className={`text-sm ${on ? "text-brand-strong" : "text-ink-2"}`}>
          {statusText(s)}
        </span>
      </span>
      {children}
    </li>
  );
}

export function FriendsView({
  friends,
  incoming,
  outgoing,
}: {
  friends: Friend[];
  incoming: Friend[];
  outgoing: Friend[];
}) {
  const router = useRouter();
  const statuses = usePresence((s) => s.statuses);
  const reload = usePresence((s) => s.reload);
  const [name, setName] = useState("");
  const [result, setResult] = useState<FriendResult | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<FriendResult>) =>
    start(async () => {
      const r = await fn();
      setResult(r.message ? r : null);
      reload();
      router.refresh();
    });
  const online = friends.filter((f) => statuses[f.id]?.online);
  const offline = friends.filter((f) => !statuses[f.id]?.online);

  return (
    <div className="space-y-6">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          run(async () => {
            const r = await addFriend({ username: name });
            if (r.ok) setName("");
            return r;
          });
        }}
      >
        <Input
          aria-label="Username"
          placeholder="@username"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
        />
        <Button type="submit" disabled={pending || !name.trim()}>
          Add
        </Button>
      </form>
      {result ? <Alert tone={result.ok ? "success" : "error"}>{result.message}</Alert> : null}

      {incoming.length ? (
        <section aria-labelledby="req-h">
          <h2 id="req-h" className="mb-2 px-1 text-sm font-semibold text-ink-2">
            Requests ({incoming.length})
          </h2>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {incoming.map((f) => (
              <Row key={f.id} f={f}>
                <Button size="md" disabled={pending} onClick={() => run(() => acceptFriend(f.id))}>
                  Accept
                </Button>
                <Button
                  size="md"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => run(() => dropRequest(f.id))}
                >
                  Decline
                </Button>
              </Row>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="on-h">
        <h2 id="on-h" className="mb-2 px-1 text-sm font-semibold text-ink-2">
          Online ({online.length})
        </h2>
        {online.length ? (
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {online.map((f) => {
              const href = watchHref(f, statuses[f.id]);
              return (
                <Row key={f.id} f={f}>
                  {href ? (
                    <Link href={href} className={buttonClasses("secondary", "md")}>
                      <Eye size={16} aria-hidden="true" /> Watch
                    </Link>
                  ) : null}
                </Row>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink-2">
            {friends.length
              ? "None of your friends are on right now."
              : "Add friends by their @username."}
          </p>
        )}
      </section>

      {offline.length ? (
        <section aria-labelledby="off-h">
          <h2 id="off-h" className="mb-2 px-1 text-sm font-semibold text-ink-2">
            Offline
          </h2>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {offline.map((f) => (
              <Row key={f.id} f={f} />
            ))}
          </ul>
        </section>
      ) : null}

      {outgoing.length ? (
        <section aria-labelledby="out-h">
          <h2 id="out-h" className="mb-2 px-1 text-sm font-semibold text-ink-2">
            Requests you sent
          </h2>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {outgoing.map((f) => (
              <Row key={f.id} f={f}>
                <Button
                  size="md"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => run(() => dropRequest(f.id))}
                >
                  Cancel
                </Button>
              </Row>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
