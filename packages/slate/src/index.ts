import { createRequire } from "node:module";

export const VERSION = "1.0.0" as const;

export type Color = "default" | `#${string}`;
export type KeyCode = string;
export type Modifiers = number;

export interface RenderOptions {
  readonly text: string;
  readonly width?: number;
  readonly height?: number;
  readonly x?: number;
  readonly y?: number;
  readonly foreground?: Color;
}

export interface SlateEvent {
  readonly kind: "key" | "mouse" | "resize" | "paste" | "focusGained" | "focusLost";
  readonly code?: string;
  readonly text?: string;
  readonly modifiers?: number;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
}

interface NativeBinding {
  render(options: RenderOptions): string;
  renderText(text: string): string;
  enableMouseCapture(): void;
  disableMouseCapture(): void;
  pollEvent(timeoutMs?: number): SlateEvent | null;
}

const require = createRequire(import.meta.url);
let cachedNative: NativeBinding | null | undefined;

function native(): NativeBinding | undefined {
  if (cachedNative !== undefined) return cachedNative ?? undefined;
  for (const name of ["@slate-terminal/native", "slate-node"]) {
    try {
      cachedNative = require(name) as NativeBinding;
      return cachedNative;
    } catch { }
  }
  cachedNative = null;
  return undefined;
}

export function hasNativeBinding(): boolean { return native() !== undefined; }

export function render(options: RenderOptions): string {
  validate(options);
  return native()?.render(options) ?? renderFallback(options);
}

export function renderText(text: string, options: Omit<RenderOptions, "text"> = {}): string {
  const all = { ...options, text };
  return native()?.renderText(text) ?? renderFallback(all);
}

export function enableMouseCapture(): void {
  const binding = native();
  if (!binding) throw new Error("Binding nativo da Slate não encontrado; compile slate-node primeiro.");
  binding.enableMouseCapture();
}

export function disableMouseCapture(): void { native()?.disableMouseCapture(); }
export function pollEvent(timeoutMs = 16): SlateEvent | null { return native()?.pollEvent(timeoutMs) ?? null; }

function validate(options: RenderOptions): void {
  for (const key of ["width", "height", "x", "y"] as const) {
    const value = options[key];
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) throw new RangeError(`${key} deve ser um inteiro não negativo`);
  }
  if (options.foreground !== undefined && !/^#[0-9a-fA-F]{6}$/.test(options.foreground) && options.foreground !== "default") throw new TypeError("foreground deve usar #RRGGBB ou default");
}

function renderFallback(options: RenderOptions): string {
  const lines = options.text.split("\n");
  const width = options.width ?? Math.max(1, ...lines.map(line => [...line].length));
  const height = options.height ?? Math.max(1, lines.length);
  const x = options.x ?? 0;
  const y = options.y ?? 0;
  let output = `\x1b[2J\x1b[H\x1b[?25l`;
  const color = options.foreground && options.foreground !== "default" ? `\x1b[38;2;${parseInt(options.foreground.slice(1, 3), 16)};${parseInt(options.foreground.slice(3, 5), 16)};${parseInt(options.foreground.slice(5, 7), 16)}m` : "\x1b[39m";
  for (let row = 0; row < Math.min(height, lines.length + y); row++) {
    const line = lines[row - y] ?? "";
    if (row < y) continue;
    output += `\x1b[${row + 1};${x + 1}H${color}${line.slice(0, Math.max(0, width - x))}`;
  }
  return `${output}\x1b[0m`;
}
