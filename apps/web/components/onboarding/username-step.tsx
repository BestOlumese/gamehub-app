"use client";

import { Button } from "@gamehub/ui/forms/button";
import { inputClasses } from "@gamehub/ui/forms/input";
import { Spinner } from "@gamehub/ui/forms/spinner";
import { Check } from "lucide-react";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { checkUsername, saveUsername } from "@/app/(app)/onboarding/actions";
import {
  normalizeUsername,
  USERNAME_MAX,
  usernameFormatProblem,
  usernameMessages,
} from "@/lib/username";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available"; name: string }
  | { kind: "problem"; text: string };

type Remote = { name: string; status: Status };

export function UsernameStep({
  suggestions,
  stepLabel,
}: {
  suggestions: string[];
  stepLabel?: string;
}) {
  const [value, setValue] = useState("");
  const [remote, setRemote] = useState<Remote | null>(null);
  const [saving, startSaving] = useTransition();
  const name = normalizeUsername(value);
  const formatProblem = name ? usernameFormatProblem(name) : null;

  // Format problems show instantly; availability is checked after a short pause.
  useEffect(() => {
    if (!name || formatProblem) return;
    let stale = false;
    const t = setTimeout(async () => {
      const res = await checkUsername(name);
      if (stale) return;
      setRemote({
        name,
        status: res.ok
          ? { kind: "available", name: res.username }
          : { kind: "problem", text: usernameMessages[res.reason] },
      });
    }, 350);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [name, formatProblem]);

  const status: Status = !name
    ? { kind: "idle" }
    : formatProblem
      ? { kind: "problem", text: usernameMessages[formatProblem] }
      : remote?.name === name
        ? remote.status
        : { kind: "checking" };

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status.kind !== "available") return;
    startSaving(async () => {
      // Redirects to /home on success; only failures come back.
      const res = await saveUsername(status.name);
      setRemote({
        name: status.name,
        status: { kind: "problem", text: usernameMessages[res.reason] },
      });
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <div>
        {stepLabel ? <p className="text-sm font-semibold text-brand">{stepLabel}</p> : null}
        <h1 className="mt-1 font-display text-2xl leading-[1.15] font-extrabold tracking-tight">
          Pick your username
        </h1>
        <p className="mt-2 text-ink-2">
          This is the name other players see at the table. You can&apos;t change it later.
        </p>
      </div>

      <div>
        <label htmlFor="username" className="mb-1.5 block text-sm font-semibold">
          Username
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-ink-2">
            @
          </span>
          <input
            id="username"
            name="username"
            value={value}
            onChange={(e) => setValue(e.target.value.toLowerCase())}
            maxLength={USERNAME_MAX}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={`${inputClasses} pr-11 pl-9`}
            aria-invalid={status.kind === "problem" || undefined}
            aria-describedby="username-msg"
          />
          <span className="absolute inset-y-0 right-4 flex items-center" aria-hidden="true">
            {status.kind === "checking" ? <Spinner className="size-4 text-ink-3" /> : null}
            {status.kind === "available" ? (
              <Check size={18} className="text-brand" strokeWidth={3} />
            ) : null}
          </span>
        </div>
        <p
          id="username-msg"
          aria-live="polite"
          className={`mt-1.5 min-h-5 text-sm ${status.kind === "problem" ? "text-danger-strong" : status.kind === "available" ? "text-brand" : "text-ink-2"}`}
        >
          {status.kind === "problem"
            ? status.text
            : status.kind === "available"
              ? "Nice, that one's free."
              : "3–20 characters: lowercase letters, numbers and _."}
        </p>
      </div>

      {suggestions.length > 0 ? (
        <div>
          <p className="mb-2 text-sm text-ink-2">Or pick one:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setValue(s)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors duration-(--dur-press) ${name === s ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-surface hover:border-ink-3"}`}
              >
                @{s}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <Button type="submit" block disabled={status.kind !== "available" || saving}>
        {saving ? <Spinner /> : null}
        Start playing
      </Button>
    </form>
  );
}
