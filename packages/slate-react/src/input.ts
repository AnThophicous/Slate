import { uuid } from "./identity.js";
import type { SlateEvent } from "./types.js";
import type { SlateInputSource } from "./runtime.js";

const keyAliases: Readonly<Record<string, string>> = {
  esc: "Escape", escape: "Escape", return: "Enter", enter: "Enter", " ": "Space", space: "Space", spacebar: "Space", backtab: "Tab", "back-tab": "Tab",
  bs: "Backspace", backspace: "Backspace", del: "Delete", delete: "Delete", insert: "Insert", home: "Home", end: "End", pgup: "PageUp", pageup: "PageUp", pgdn: "PageDown", pagedown: "PageDown",
  left: "ArrowLeft", arrowleft: "ArrowLeft", right: "ArrowRight", arrowright: "ArrowRight",
  up: "ArrowUp", arrowup: "ArrowUp", down: "ArrowDown", arrowdown: "ArrowDown"
};

const mouseActionAliases: Readonly<Record<string, SlateEvent["action"]>> = {
  down: "press", press: "press", up: "release", release: "release",
  mousedown: "press", mouseup: "release", drag: "drag", moved: "move", move: "move", mousemove: "move", mousemoved: "move",
  scroll: "scroll", wheel: "scroll", scrollup: "scroll", scrolldown: "scroll", scrollleft: "scroll", scrollright: "scroll",
  wheelup: "scroll", wheeldown: "scroll"
};

const mouseButtonAliases: Readonly<Record<string, SlateEvent["button"]>> = {
  left: "left", buttonleft: "left", l: "left", "0": "left", right: "right", buttonright: "right", r: "right", "1": "right",
  middle: "middle", buttonmiddle: "middle", m: "middle", "2": "middle", other: "other"
};

const semanticFields = [
  "kind", "code", "text", "phase", "modifiers", "x", "y", "width", "height",
  "action", "button", "deltaX", "deltaY", "target"
] as const;

export interface NormalizedInputOptions {
  /** Set to false when a source intentionally emits adjacent identical events. */
  readonly deduplicate?: boolean;
}

/** Normalizes platform-specific key names and assigns an event identity. */
export function normalizeEvent(event: SlateEvent): SlateEvent {
  const code = event.code === undefined ? undefined : keyAliases[String(event.code).toLowerCase()] ?? event.code;
  const action = event.action === undefined ? undefined : mouseActionAliases[compact(String(event.action))] ?? event.action;
  const button = event.button === undefined ? undefined : mouseButtonAliases[compact(String(event.button))] ?? event.button;
  return {
    ...event,
    id: event.id ?? uuid(),
    code,
    text: event.text ?? (event.kind === "key" && event.code && event.code.length === 1 ? event.code : code && code.length === 1 ? code : undefined),
    action,
    button,
    x: integer(event.x),
    y: integer(event.y),
    width: integer(event.width),
    height: integer(event.height),
    deltaX: integer(event.deltaX),
    deltaY: integer(event.deltaY),
    modifiers: integer(event.modifiers) ?? 0
  };
}

/** Returns a stable key for event meaning; generated `id` is deliberately ignored. */
export function semanticEventKey(event: SlateEvent): string {
  const normalized = normalizeEvent(event);
  return JSON.stringify(semanticFields.map(field => normalized[field] ?? null));
}

export function sameEvent(left: SlateEvent, right: SlateEvent): boolean {
  return semanticEventKey(left) === semanticEventKey(right);
}

/** Ctrl+C is a process-safe emergency exit in every Slate input path. */
export function isEmergencyExit(event: SlateEvent): boolean {
  if (event.kind !== "key" || event.phase === "release" || ((event.modifiers ?? 0) & 2) === 0) return false;
  const code = String(event.code ?? event.text ?? "").toLowerCase();
  return code === "c" || code === "keyc" || code === "ctrl+c";
}

/** Adapts any input source to Slate's canonical event contract. */
export function createNormalizedInput(source: SlateInputSource, options: NormalizedInputOptions = {}): SlateInputSource {
  let lastObject: SlateEvent | null = null;
  let lastKey: string | undefined;
  return {
    close: source.close,
    poll(timeoutMs) {
      const event = source.poll(timeoutMs);
      if (!event) {
        lastObject = null;
        lastKey = undefined;
        return null;
      }
      const normalized = normalizeEvent(event);
      const key = semanticEventKey(normalized);
      if (event === lastObject || (options.deduplicate !== false && key === lastKey)) return null;
      lastObject = event;
      lastKey = key;
      return normalized;
    }
  };
}

function integer(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : undefined;
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}
