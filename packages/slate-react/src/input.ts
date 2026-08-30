import { uuid } from "./identity.js";
import type { SlateEvent } from "./types.js";
import type { SlateInputSource } from "./runtime.js";

const keyAliases: Readonly<Record<string, string>> = {
  Esc: "Escape", Return: "Enter", " ": "Space", Spacebar: "Space",
  Left: "ArrowLeft", Right: "ArrowRight", Up: "ArrowUp", Down: "ArrowDown"
};

/** Normalizes platform-specific key names and assigns an event identity. */
export function normalizeEvent(event: SlateEvent): SlateEvent {
  return {
    ...event,
    id: event.id ?? uuid(),
    code: event.code === undefined ? undefined : keyAliases[event.code] ?? event.code,
    text: event.text ?? (event.kind === "key" && event.code && event.code.length === 1 ? event.code : undefined)
  };
}

/** Adapts any input source to Slate's canonical event contract. */
export function createNormalizedInput(source: SlateInputSource): SlateInputSource {
  let lastObject: SlateEvent | null = null;
  return {
    poll(timeoutMs) {
      const event = source.poll(timeoutMs);
      if (!event || event === lastObject) return null;
      lastObject = event;
      return normalizeEvent(event);
    }
  };
}
