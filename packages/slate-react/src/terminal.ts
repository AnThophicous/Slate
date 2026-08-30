import { isSignal } from "./reactive.js";
import { widgetText } from "./widgets.js";
import type { ComponentTreeNode, EffectSpec } from "./types.js";
import type { LayoutRect, LayoutTreeNode, Viewport } from "./flex.js";

export interface TerminalRenderOptions {
  readonly clear?: boolean;
  readonly hideCursor?: boolean;
  readonly restoreCursor?: boolean;
  readonly frameIndex?: number;
  readonly defaultForeground?: string;
  readonly defaultBackground?: string;
  readonly cursor?: { readonly x: number; readonly y: number; readonly visible?: boolean };
}

interface Cell {
  char: string;
  foreground: string | undefined;
  background: string | undefined;
}

interface TerminalStyle {
  readonly foreground: string | undefined;
  readonly background: string | undefined;
}

export function renderTreeToAnsi(tree: ComponentTreeNode | null, layout: LayoutTreeNode | null, viewport: Viewport, options: TerminalRenderOptions = {}): string {
  const width = Math.max(0, Math.floor(viewport.width));
  const height = Math.max(0, Math.floor(viewport.height));
  const cells = Array.from({ length: height }, () => Array.from({ length: width }, () => ({ char: " ", foreground: undefined, background: undefined })) as Cell[]);
  if (tree && layout) {
    paint(tree, layout, cells, { x: 0, y: 0, width, height }, { foreground: normalizeHex(options.defaultForeground), background: normalizeHex(options.defaultBackground) }, options.frameIndex ?? 0, undefined);
  }
  const output: string[] = [];
  if (options.clear !== false) output.push("\u001b[2J");
  output.push("\u001b[H");
  if (options.hideCursor !== false) output.push("\u001b[?25l");
  for (const row of cells) {
    let previous: TerminalStyle = { foreground: undefined, background: undefined };
    let line = "";
    for (const cell of row) {
      if (cell.foreground !== previous.foreground || cell.background !== previous.background) {
        line += styleCode(cell.foreground, cell.background);
        previous = { foreground: cell.foreground, background: cell.background };
      }
      line += cell.char;
    }
    if (previous.foreground !== undefined || previous.background !== undefined) line += "\u001b[0m";
    output.push(line);
  }
  if (options.restoreCursor) output.push("\u001b[?25h");
  if (options.cursor) {
    output.push(`\u001b[${Math.max(1, Math.floor(options.cursor.y) + 1)};${Math.max(1, Math.floor(options.cursor.x) + 1)}H`);
    output.push(options.hideCursor === true || options.cursor.visible === false ? "\u001b[?25l" : "\u001b[?25h");
  }
  return output.join("\n");
}

export function findLayoutNode(layout: LayoutTreeNode | null, id: string | number): LayoutTreeNode | undefined {
  if (!layout) return undefined;
  if (layout.id === id) return layout;
  for (const child of layout.children) {
    const result = findLayoutNode(child, id);
    if (result) return result;
  }
  return undefined;
}

function paint(tree: ComponentTreeNode, layout: LayoutTreeNode, cells: Cell[][], parentClip: LayoutRect, inherited: TerminalStyle, frameIndex: number, inheritedEffect: EffectSpec | undefined): void {
  if (tree.props.visible === false || (tree.type === "modal" && tree.props.open !== undefined && readValue(tree.props.open) === false) || layout.layout.width < 1 || layout.layout.height < 1) return;
  const clip = layout.clip ? intersect(parentClip, layout.clip) : parentClip;
  if (clip.width < 1 || clip.height < 1) return;
  const style = {
    foreground: readColor(tree.props.foreground) ?? inherited.foreground,
    background: readColor(tree.props.background) ?? inherited.background
  };
  const effect = readEffect(tree.props.effect) ?? inheritedEffect;
  fill(cells, layout.layout, clip, style.background, style.foreground);
  const lines = widgetText(tree, frameIndex);
  const origin = layout.content;
  for (let index = 0; index < lines.length; index += 1) {
    drawText(cells, origin.x, origin.y + index, lines[index] ?? "", clip, style, effect, frameIndex, index);
  }
  for (const childLayout of layout.children) {
    const child = tree.children.find(candidate => candidate.id === childLayout.id);
    if (child) paint(child, childLayout, cells, clip, style, frameIndex, effect);
  }
}

function fill(cells: Cell[][], rect: LayoutRect, clip: LayoutRect, background: string | undefined, foreground: string | undefined): void {
  if (background === undefined && foreground === undefined) return;
  const bounds = intersect(rect, clip);
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    const row = cells[y];
    if (!row) continue;
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const cell = row[x];
      if (!cell) continue;
      if (background !== undefined) cell.background = background;
      if (foreground !== undefined) cell.foreground = foreground;
    }
  }
}

function drawText(cells: Cell[][], x: number, y: number, text: string, clip: LayoutRect, style: TerminalStyle, effect: EffectSpec | undefined, frameIndex: number, lineIndex: number): void {
  if (y < clip.y || y >= clip.y + clip.height || y < 0 || y >= cells.length) return;
  let cursor = x;
  const characters = segmentGraphemes(text);
  for (const [characterIndex, character] of characters.entries()) {
    const width = characterWidth(character);
    const glyphStyle = effectStyle(style, effect, characterIndex, lineIndex, frameIndex, characters.length);
    if (cursor >= clip.x && cursor < clip.x + clip.width && cursor >= 0 && cursor < (cells[y]?.length ?? 0)) {
      const cell = cells[y]?.[cursor];
      if (cell) {
        cell.char = character;
        cell.foreground = glyphStyle.foreground;
        cell.background = glyphStyle.background;
      }
      if (width === 2 && cursor + 1 < clip.x + clip.width && cursor + 1 < (cells[y]?.length ?? 0)) {
        const continuation = cells[y]?.[cursor + 1];
        if (continuation) {
          continuation.char = "";
          continuation.foreground = glyphStyle.foreground;
          continuation.background = glyphStyle.background;
        }
      }
    }
    cursor += width;
    if (cursor >= clip.x + clip.width) break;
  }
}

function intersect(a: LayoutRect, b: LayoutRect): LayoutRect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

function readColor(value: unknown): string | undefined {
  const resolved = isSignal(value) ? value.get() : value;
  return normalizeHex(resolved);
}

function readValue(value: unknown): unknown {
  return isSignal(value) ? value.get() : value;
}

function normalizeHex(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (/^#[0-9a-fA-F]{3}$/.test(value)) return `#${value.slice(1).split("").map(part => part + part).join("").toLowerCase()}`;
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  return undefined;
}

function readEffect(value: unknown): EffectSpec | undefined {
  const resolved = isSignal(value) ? value.get() : value;
  if (!isRecord(resolved) || typeof resolved.kind !== "string") return undefined;
  if (resolved.kind === "glow" && typeof resolved.color === "string" && normalizeHex(resolved.color)) return resolved as unknown as EffectSpec;
  if (resolved.kind === "colorShift" && typeof resolved.from === "string" && typeof resolved.to === "string" && normalizeHex(resolved.from) && normalizeHex(resolved.to)) return resolved as unknown as EffectSpec;
  return undefined;
}

function effectStyle(style: TerminalStyle, effect: EffectSpec | undefined, characterIndex: number, lineIndex: number, frameIndex: number, textLength: number): TerminalStyle {
  if (!effect) return style;
  if (effect.kind === "glow") {
    const color = normalizeHex(effect.color);
    if (!color) return style;
    const radius = Math.max(1, finite(effect.radius, 2));
    const speed = Math.max(0, finite(effect.speed, 1));
    const intensity = clamp(finite(effect.intensity, 0.5), 0, 1);
    const span = Math.max(1, textLength + radius * 2);
    const center = (frameIndex * 0.22 * speed) % span - radius;
    const distance = Math.abs(characterIndex - center);
    const wave = distance <= radius ? 1 - distance / (radius + 1) : 0;
    return { ...style, foreground: blend(style.foreground ?? "#808080", color, wave * intensity) };
  }
  const from = normalizeHex(effect.from);
  const to = normalizeHex(effect.to);
  if (!from || !to) return style;
  const speed = Math.max(0, finite(effect.speed, 1));
  const phase = Math.sin(frameIndex * 0.1 * speed - characterIndex * 0.32 - lineIndex * 0.18) * 0.5 + 0.5;
  return { ...style, foreground: blend(from, to, phase) };
}

function blend(from: string, to: string, amount: number): string {
  const value = clamp(amount, 0, 1);
  const red = Math.round(Number.parseInt(from.slice(1, 3), 16) + (Number.parseInt(to.slice(1, 3), 16) - Number.parseInt(from.slice(1, 3), 16)) * value);
  const green = Math.round(Number.parseInt(from.slice(3, 5), 16) + (Number.parseInt(to.slice(3, 5), 16) - Number.parseInt(from.slice(3, 5), 16)) * value);
  const blue = Math.round(Number.parseInt(from.slice(5, 7), 16) + (Number.parseInt(to.slice(5, 7), 16) - Number.parseInt(from.slice(5, 7), 16)) * value);
  return `#${[red, green, blue].map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function styleCode(foreground: string | undefined, background: string | undefined): string {
  const codes: string[] = [];
  const foregroundRgb = rgb(foreground);
  const backgroundRgb = rgb(background);
  if (foregroundRgb) codes.push(`38;2;${foregroundRgb.join(";")}`);
  if (backgroundRgb) codes.push(`48;2;${backgroundRgb.join(";")}`);
  return codes.length > 0 ? `\u001b[${codes.join(";")}m` : "\u001b[0m";
}

function rgb(value: string | undefined): readonly [number, number, number] | undefined {
  if (!value) return undefined;
  return [Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16)];
}

function characterWidth(value: string): number {
  const code = value.codePointAt(0) ?? 0;
  if (code < 0x20 || /^(?:\p{Mark}|\uFE0F|\u200D)/u.test(value)) return 0;
  if (/\p{Extended_Pictographic}/u.test(value) || [...value].some(char => {
    const point = char.codePointAt(0) ?? 0;
    return point >= 0x1100 && (point <= 0x115f || point === 0x2329 || point === 0x232a || (point >= 0x2e80 && point <= 0xa4cf) || (point >= 0xac00 && point <= 0xd7a3) || (point >= 0xf900 && point <= 0xfaff) || (point >= 0xfe10 && point <= 0xfe19) || (point >= 0xff01 && point <= 0xff60));
  })) return 2;
  return 1;
}

function segmentGraphemes(value: string): string[] {
  const Segmenter = (Intl as typeof Intl & { Segmenter?: new (locale?: string, options?: { granularity: "grapheme" }) => { segment(input: string): Iterable<{ segment: string }> } }).Segmenter;
  return Segmenter ? [...new Segmenter(undefined, { granularity: "grapheme" }).segment(value)].map(item => item.segment) : [...value];
}
