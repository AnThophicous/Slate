import { isSignal } from "./reactive.js";
import { graphemeWidth, segmentGraphemes, splitLines, wrapText } from "./text.js";
import { widgetText } from "./widgets.js";
import type { ComponentTreeNode, EffectSpec, TextStyle } from "./types.js";
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
  bold: boolean | undefined;
  dim: boolean | undefined;
  italic: boolean | undefined;
  underline: boolean | undefined;
  strikethrough: boolean | undefined;
  link: string | undefined;
}

interface TerminalStyle {
  readonly foreground: string | undefined;
  readonly background: string | undefined;
  readonly bold: boolean | undefined;
  readonly dim: boolean | undefined;
  readonly italic: boolean | undefined;
  readonly underline: boolean | undefined;
  readonly strikethrough: boolean | undefined;
  readonly link: string | undefined;
}

export function renderTreeToAnsi(tree: ComponentTreeNode | null, layout: LayoutTreeNode | null, viewport: Viewport, options: TerminalRenderOptions = {}): string {
  const width = Math.max(0, Math.floor(viewport.width));
  const height = Math.max(0, Math.floor(viewport.height));
  const cells = Array.from({ length: height }, () => Array.from({ length: width }, () => ({
    char: " ",
    foreground: undefined,
    background: undefined,
    bold: undefined,
    dim: undefined,
    italic: undefined,
    underline: undefined,
    strikethrough: undefined,
    link: undefined
  })) as Cell[]);
  if (tree && layout) {
    paint(tree, layout, cells, { x: 0, y: 0, width, height }, {
      foreground: normalizeHex(options.defaultForeground),
      background: normalizeHex(options.defaultBackground),
      bold: undefined,
      dim: undefined,
      italic: undefined,
      underline: undefined,
      strikethrough: undefined,
      link: undefined
    }, options.frameIndex ?? 0, undefined);
  }
  const output: string[] = [];
  if (options.clear !== false) output.push("\u001b[2J");
  output.push("\u001b[H");
  if (options.hideCursor !== false) output.push("\u001b[?25l");
  for (const row of cells) {
    let previous: TerminalStyle = {
      foreground: undefined,
      background: undefined,
      bold: undefined,
      dim: undefined,
      italic: undefined,
      underline: undefined,
      strikethrough: undefined,
      link: undefined
    };
    let line = "";
    for (const cell of row) {
      const style = cellStyle(cell);
      if (cell.link !== previous.link) {
        if (previous.link !== undefined) line += hyperlinkCode();
        if (cell.link !== undefined) line += hyperlinkCode(cell.link);
      }
      if (!sameStyle(style, previous)) {
        line += styleCode(style);
      }
      previous = style;
      line += cell.char;
    }
    if (previous.link !== undefined) line += hyperlinkCode();
    if (hasStyle(previous)) line += "\u001b[0m";
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
  const textStyle = mergeTextStyle(inherited, tree.props.textStyle);
  const style: TerminalStyle = {
    foreground: readColor(tree.props.foreground) ?? textStyle.foreground ?? inherited.foreground,
    background: readColor(tree.props.background) ?? textStyle.background ?? inherited.background,
    bold: textStyle.bold ?? inherited.bold,
    dim: textStyle.dim ?? inherited.dim,
    italic: textStyle.italic ?? inherited.italic,
    underline: textStyle.underline ?? inherited.underline,
    strikethrough: textStyle.strikethrough ?? inherited.strikethrough,
    link: normalizeLink(tree.props.link) ?? inherited.link
  };
  const effect = readEffect(tree.props.effect) ?? inheritedEffect;
  fill(cells, layout.layout, clip, style);
  const lines = widgetText(tree, frameIndex).flatMap(line => tree.props.wrapText === false
    ? splitLines(line)
    : wrapText(line, layout.content.width));
  const origin = layout.content;
  for (let index = 0; index < lines.length; index += 1) {
    drawText(cells, origin.x, origin.y + index, lines[index] ?? "", clip, style, effect, frameIndex, index);
  }
  for (const childLayout of layout.children) {
    const child = tree.children.find(candidate => candidate.id === childLayout.id);
    if (child) paint(child, childLayout, cells, clip, style, frameIndex, effect);
  }
}

function fill(cells: Cell[][], rect: LayoutRect, clip: LayoutRect, style: TerminalStyle): void {
  if (!hasStyle(style)) return;
  const bounds = intersect(rect, clip);
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    const row = cells[y];
    if (!row) continue;
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const cell = row[x];
      if (!cell) continue;
      applyStyle(cell, style);
    }
  }
}

function drawText(cells: Cell[][], x: number, y: number, text: string, clip: LayoutRect, style: TerminalStyle, effect: EffectSpec | undefined, frameIndex: number, lineIndex: number): void {
  if (y < clip.y || y >= clip.y + clip.height || y < 0 || y >= cells.length) return;
  let cursor = x;
  const characters = segmentGraphemes(text);
  for (const [characterIndex, character] of characters.entries()) {
    const width = graphemeWidth(character);
    const glyphStyle = effectStyle(style, effect, characterIndex, lineIndex, frameIndex, characters.length);
    if (width === 0) {
      const previous = cells[y]?.[cursor - 1];
      if (previous && previous.char !== "") {
        previous.char += character;
        applyStyle(previous, glyphStyle);
      }
      continue;
    }
    if (cursor + width > clip.x + clip.width) break;
    if (cursor >= clip.x && cursor < clip.x + clip.width && cursor >= 0 && cursor < (cells[y]?.length ?? 0)) {
      const cell = cells[y]?.[cursor];
      if (cell) {
        cell.char = character;
        applyStyle(cell, glyphStyle);
      }
      if (width === 2 && cursor + 1 < clip.x + clip.width && cursor + 1 < (cells[y]?.length ?? 0)) {
        const continuation = cells[y]?.[cursor + 1];
        if (continuation) {
          continuation.char = "";
          applyStyle(continuation, glyphStyle);
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

function mergeTextStyle(inherited: TerminalStyle, value: unknown): TextStyle {
  if (!isRecord(value)) return {
    bold: inherited.bold,
    dim: inherited.dim,
    italic: inherited.italic,
    underline: inherited.underline,
    strikethrough: inherited.strikethrough
  };
  return {
    foreground: readColor(value.foreground) ?? inherited.foreground,
    background: readColor(value.background) ?? inherited.background,
    bold: typeof value.bold === "boolean" ? value.bold : inherited.bold,
    dim: typeof value.dim === "boolean" ? value.dim : inherited.dim,
    italic: typeof value.italic === "boolean" ? value.italic : inherited.italic,
    underline: typeof value.underline === "boolean" ? value.underline : inherited.underline,
    strikethrough: typeof value.strikethrough === "boolean" ? value.strikethrough : inherited.strikethrough
  };
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

function styleCode(style: TerminalStyle): string {
  const codes: string[] = ["0"];
  if (style.bold) codes.push("1");
  if (style.dim) codes.push("2");
  if (style.italic) codes.push("3");
  if (style.underline) codes.push("4");
  if (style.strikethrough) codes.push("9");
  const foregroundRgb = rgb(style.foreground);
  const backgroundRgb = rgb(style.background);
  if (foregroundRgb) codes.push(`38;2;${foregroundRgb.join(";")}`);
  if (backgroundRgb) codes.push(`48;2;${backgroundRgb.join(";")}`);
  return `\u001b[${codes.join(";")}m`;
}

function rgb(value: string | undefined): readonly [number, number, number] | undefined {
  if (!value) return undefined;
  return [Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16)];
}

function cellStyle(cell: Cell): TerminalStyle {
  return {
    foreground: cell.foreground,
    background: cell.background,
    bold: cell.bold,
    dim: cell.dim,
    italic: cell.italic,
    underline: cell.underline,
    strikethrough: cell.strikethrough,
    link: cell.link
  };
}

function applyStyle(cell: Cell, style: TerminalStyle): void {
  if (style.foreground !== undefined) cell.foreground = style.foreground;
  if (style.background !== undefined) cell.background = style.background;
  if (style.bold !== undefined) cell.bold = style.bold;
  if (style.dim !== undefined) cell.dim = style.dim;
  if (style.italic !== undefined) cell.italic = style.italic;
  if (style.underline !== undefined) cell.underline = style.underline;
  if (style.strikethrough !== undefined) cell.strikethrough = style.strikethrough;
  if (style.link !== undefined) cell.link = style.link;
}

function sameStyle(left: TerminalStyle, right: TerminalStyle): boolean {
  return left.foreground === right.foreground
    && left.background === right.background
    && left.bold === right.bold
    && left.dim === right.dim
    && left.italic === right.italic
    && left.underline === right.underline
    && left.strikethrough === right.strikethrough
    && left.link === right.link;
}

function hasStyle(style: TerminalStyle): boolean {
  return style.foreground !== undefined
    || style.background !== undefined
    || style.bold !== undefined
    || style.dim !== undefined
    || style.italic !== undefined
    || style.underline !== undefined
    || style.strikethrough !== undefined;
}

function normalizeLink(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f\u007f]/u.test(value)) return undefined;
  return value;
}

function hyperlinkCode(url?: string): string {
  return url === undefined ? "\u001b]8;;\u001b\\" : `\u001b]8;;${url}\u001b\\`;
}
