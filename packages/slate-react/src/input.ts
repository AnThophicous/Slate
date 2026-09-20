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

const scrollDeltas: Readonly<Record<string, readonly [number, number]>> = {
  scrollup: [0, -1],
  scrolldown: [0, 1],
  scrollleft: [-1, 0],
  scrollright: [1, 0],
  wheelup: [0, -1],
  wheeldown: [0, 1]
};

export interface NormalizedInputOptions {
  /**
   * Opt-in semantic deduplication for sources that are known to deliver the
   * same event twice. It is off by default: two adjacent identical events are
   * normally two real deliveries (key repeat, fast typing, wheel scroll), and
   * content equality cannot tell a duplicate delivery from a legitimate one.
   */
  readonly deduplicate?: boolean;
}

/** Normalizes platform-specific key names and assigns an event identity. */
export function normalizeEvent(event: SlateEvent): SlateEvent {
  const rawCode = typeof event.code === "string" ? event.code : undefined;
  const rawText = typeof event.text === "string" ? event.text : undefined;
  const code = rawCode === undefined ? undefined : keyAliases[rawCode.toLowerCase()] ?? keyAliases[compact(rawCode)] ?? rawCode;
  const rawAction = typeof event.action === "string" ? event.action : undefined;
  const rawButton = typeof event.button === "string" ? event.button : undefined;
  const actionKey = rawAction === undefined ? undefined : compact(rawAction);
  const action = actionKey === undefined ? undefined : mouseActionAliases[actionKey] ?? rawAction as SlateEvent["action"];
  const button = rawButton === undefined ? undefined : mouseButtonAliases[compact(rawButton)] ?? rawButton as SlateEvent["button"];
  const phase = normalizePhase(event.phase);
  let modifiers = integer(event.modifiers) ?? 0;
  if (event.kind === "key" && rawCode !== undefined && compact(rawCode) === "backtab") modifiers |= 1;
  const direction = actionKey === undefined ? undefined : scrollDeltas[actionKey];
  const deltaX = integer(event.deltaX) ?? direction?.[0];
  const deltaY = integer(event.deltaY) ?? direction?.[1];
  return {
    ...event,
    id: event.id ?? uuid(),
    code,
    text: rawText ?? (event.kind === "key" && rawCode !== undefined && rawCode.length === 1 ? rawCode : code && code.length === 1 ? code : undefined),
    phase,
    action,
    button,
    x: integer(event.x),
    y: integer(event.y),
    width: integer(event.width),
    height: integer(event.height),
    deltaX,
    deltaY,
    modifiers
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
  if (event.kind !== "key" || normalizePhase(event.phase) === "release" || ((event.modifiers ?? 0) & 2) === 0) return false;
  const code = String(event.code ?? event.text ?? "").toLowerCase();
  return code === "c" || code === "keyc" || code === "ctrl+c";
}

/** Adapts any input source to Slate's canonical event contract. */
export function createNormalizedInput(source: SlateInputSource, options: NormalizedInputOptions = {}): SlateInputSource {
  const deduplicate = options.deduplicate === true;
  let lastKey: string | undefined;
  return {
    size: source.size,
    close: source.close,
    poll(timeoutMs) {
      const event = source.poll(timeoutMs);
      if (!event) {
        lastKey = undefined;
        return null;
      }
      const normalized = normalizeEvent(event);
      if (!deduplicate) return normalized;
      const key = semanticEventKey(normalized);
      if (key === lastKey) return null;
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

function normalizePhase(value: unknown): SlateEvent["phase"] | undefined {
  if (typeof value !== "string") return undefined;
  const phase = compact(value);
  if (phase === "press" || phase === "repeat" || phase === "release") return phase;
  return undefined;
}
