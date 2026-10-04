"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

type RoomCodeInputProps = {
  value: string;
  onChange: (code: string) => void;
  alphabet: string;
  length?: number;
  /** Called when the last box is filled. */
  onComplete?: (code: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
};

/** Six boxes that auto-advance, accept paste and ignore look-alike characters. */
export function RoomCodeInput({
  value,
  onChange,
  alphabet,
  length = 6,
  onComplete,
  invalid,
  autoFocus,
}: RoomCodeInputProps) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const clean = (s: string) =>
    s
      .toUpperCase()
      .split("")
      .filter((c) => alphabet.includes(c))
      .join("");

  function setFrom(index: number, chars: string) {
    const next = (value.slice(0, index) + chars + value.slice(index + chars.length)).slice(
      0,
      length,
    );
    onChange(next);
    const focusAt = Math.min(index + chars.length, length - 1);
    refs.current[focusAt]?.focus();
    if (next.length === length && !next.includes(" ")) onComplete?.(next);
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !value[i] && i > 0) {
      e.preventDefault();
      onChange(value.slice(0, i - 1) + value.slice(i));
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
  }

  function onPaste(i: number, e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const chars = clean(e.clipboardData.getData("text")).slice(0, length - i);
    if (chars) setFrom(i, chars);
  }

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="Room code">
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={value[i] ?? ""}
          onChange={(e) => {
            const chars = clean(e.target.value.replace(value[i] ?? "", "") || e.target.value);
            if (chars) setFrom(i, chars.slice(-1));
            else if (!e.target.value) onChange(value.slice(0, i) + value.slice(i + 1));
          }}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => onPaste(i, e)}
          onFocus={(e) => e.target.select()}
          autoFocus={autoFocus && i === 0}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={2}
          aria-label={`Character ${i + 1}`}
          aria-invalid={invalid || undefined}
          className="h-14 w-full min-w-0 rounded-control border border-line bg-surface text-center font-display text-2xl font-bold uppercase transition-[border-color,box-shadow] duration-(--dur-press) focus:border-brand focus:ring-3 focus:ring-brand/15 focus:outline-none aria-invalid:border-danger"
        />
      ))}
    </div>
  );
}
