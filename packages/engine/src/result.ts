import type { GameEvent, Result } from "./types";

export function ok<T>(state: T, events: GameEvent[] = []): Result<T, never> {
  return { ok: true, state, events };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
