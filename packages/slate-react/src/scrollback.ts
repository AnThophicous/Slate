import { signal } from "./reactive.js";
import type { WritableSignal } from "./types.js";

export interface ScrollbackBuffer {
  readonly lines: WritableSignal<readonly string[]>;
  readonly maxLines: number;
  readonly append: (text: string) => void;
  readonly clear: () => void;
  readonly snapshot: () => readonly string[];
  readonly window: (start: number, size: number) => readonly string[];
}

/** Bounded, streaming-friendly terminal history with no unbounded memory growth. */
export function createScrollback(maxLines = 10_000): ScrollbackBuffer {
  const limit = Math.max(1, Math.trunc(maxLines));
  const lines = signal<readonly string[]>([]);
  return {
    lines,
    maxLines: limit,
    append(text) {
      if (!text) return;
      const next = [...lines.peek(), ...text.replace(/\r/g, "").split("\n")];
      lines.set(next.length > limit ? next.slice(next.length - limit) : next);
    },
    clear: () => lines.set([]),
    snapshot: lines.peek
    ,window: (start, size) => lines.peek().slice(Math.max(0, Math.trunc(start)), Math.max(0, Math.trunc(start)) + Math.max(0, Math.trunc(size)))
  };
}
