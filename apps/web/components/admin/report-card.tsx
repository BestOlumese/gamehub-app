"use client";

import { Button } from "@gamehub/ui/forms/button";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { moderateAction } from "@/app/(app)/admin/actions";
import type { ModAction } from "@/server/moderation";

const fmt = (d: Date | string | null) =>
  d ? new Date(d).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) : "";

export type CardReport = {
  id: string;
  reporter: string | null;
  target: {
    id: string;
    username: string;
    bannedUntil: string | null;
    chatMutedUntil: string | null;
  };
  roomId: string;
  reason: string;
  message: string | null;
  createdAt: string;
  reports: number;
  actions: Array<{ action: string; until: string | null; at: string }>;
};

/** Actions for one person (a report's target, or someone found by username). */
export function ModButtons({ targetId, reportId }: { targetId: string; reportId?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (a: ModAction) =>
    start(async () => {
      await moderateAction(a);
      router.refresh();
    });
  const extra = reportId ? { reportId } : {};
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {reportId ? (
          <Button
            size="md"
            variant="secondary"
            disabled={pending}
            onClick={() => run({ action: "dismiss", reportId })}
          >
            Dismiss
          </Button>
        ) : null}
        <Button
          size="md"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            run({
              action: "warn",
              targetId,
              note: "Please keep the chat friendly. Another report and you may be muted or banned.",
              ...extra,
            })
          }
        >
          Warn
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-12 text-sm font-semibold text-ink-2">Mute</span>
        {(["1h", "24h", "7d"] as const).map((d) => (
          <Button
            key={d}
            size="md"
            variant="secondary"
            disabled={pending}
            onClick={() => run({ action: "chat_mute", targetId, duration: d, ...extra })}
          >
            {d}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-12 text-sm font-semibold text-ink-2">Ban</span>
        {(["1d", "7d", "forever"] as const).map((d) => (
          <Button
            key={d}
            size="md"
            variant="danger"
            disabled={pending}
            onClick={() => run({ action: "ban", targetId, duration: d, ...extra })}
          >
            {d === "forever" ? "Forever" : d}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function ReportCard({ r }: { r: CardReport }) {
  return (
    <li className="space-y-3 rounded-card border border-line bg-surface p-4">
      <div>
        <p className="font-semibold">
          @{r.reporter ?? "(deleted)"} → @{r.target.username} ·{" "}
          <span className="capitalize">{r.reason}</span>
        </p>
        <p className="text-sm text-ink-2">
          Room {r.roomId} · {fmt(r.createdAt)}
        </p>
      </div>
      {r.message !== null ? (
        <p className="rounded-control bg-surface-2 px-3 py-2 text-sm">
          “{r.message}” <span className="text-xs font-semibold text-brand-strong">verified</span>
        </p>
      ) : (
        <p className="text-sm text-ink-2">No message attached.</p>
      )}
      <p className="text-sm text-ink-2">
        {r.reports} {r.reports === 1 ? "report" : "reports"} ever
        {r.actions.length
          ? ` · before: ${r.actions.map((a) => a.action.replace("_", " ")).join(", ")}`
          : ""}
        {r.target.bannedUntil && new Date(r.target.bannedUntil) > new Date()
          ? ` · banned until ${fmt(r.target.bannedUntil)}`
          : ""}
        {r.target.chatMutedUntil && new Date(r.target.chatMutedUntil) > new Date()
          ? ` · muted until ${fmt(r.target.chatMutedUntil)}`
          : ""}
      </p>
      <ModButtons targetId={r.target.id} reportId={r.id} />
    </li>
  );
}
