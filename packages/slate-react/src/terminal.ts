import { isSignal } from "./reactive.js";
import { colorParameters, type ColorDepth, type TerminalCapabilities } from "./capabilities.js";
import { beginMeasurePass } from "./measure.js";
import { graphemeWidth, sanitizeTerminalText, segmentGraphemes, splitLines, wrapText } from "./text.js";
import { widgetText } from "./widgets.js";
import { renderMedia } from "./media.js";
import type { BorderSpec, ComponentTreeNode, EffectSpec, MediaSource, TextStyle } from "./types.js";
import type { LayoutRect, LayoutTreeNode, Viewport } from "./flex.js";

export interface TerminalRenderOptions {
  readonly clear?: boolean;
  readonly hideCursor?: boolean;
  readonly restoreCursor?: boolean;
  readonly frameIndex?: number;
  readonly defaultForeground?: string;
  readonly defaultBackground?: string;
  readonly mediaProtocol?: "auto" | "kitty" | "iterm2" | "none";
  readonly cursor?: { readonly x: number; readonly y: number; readonly visible?: boolean };
  /** Color depth of the output. Defaults to truecolor. */
  readonly colors?: ColorDepth;
  /** Emit Unicode box drawing. Defaults to true; false draws ASCII borders. */
  readonly unicode?: boolean;
  /** Detected capabilities, used for `colors` and `unicode` when they are omitted. */
  readonly capabilities?: Partial<TerminalCapabilities>;
  /** Reuse the pooled cell buffer between frames. Defaults to true. */
  readonly reuseBuffer?: boolean;
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

const EMPTY_STYLE: TerminalStyle = {
  foreground: undefined,
  background: undefined,
  bold: undefined,
  dim: undefined,
  italic: undefined,
  underline: undefined,
  strikethrough: undefined,
  link: undefined
};

export function renderTreeToAnsi(tree: ComponentTreeNode | null, layout: LayoutTreeNode | null, viewport: Viewport, options: TerminalRenderOptions = {}): string {
  const width = Math.max(0, Math.floor(viewport.width));
  const height = Math.max(0, Math.floor(viewport.height));
  const depth = options.colors ?? options.capabilities?.colors ?? "truecolor";
  const unicode = options.unicode ?? options.capabilities?.unicode ?? true;
  const pooled = options.reuseBuffer !== false;
  // Painting measures widget text again; a pass of its own keeps those
  // measurements memoized for this frame only.
  beginMeasurePass();
  const cells = acquireBuffer(width, height, pooled);
  try {
    return paintFrame(tree, layout, cells, width, height, depth, unicode, options);
  } finally {
    releaseBuffer(cells, pooled);
  }
}

function paintFrame(tree: ComponentTreeNode | null, layout: LayoutTreeNode | null, cells: Cell[][], width: number, height: number, depth: ColorDepth, unicode: boolean, options: TerminalRenderOptions): string {
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
    }, options.frameIndex ?? 0, undefined, unicode);
  }
  const output: string[] = [];
  if (options.clear !== false) output.push("\u001b[2J");
  output.push("\u001b[H");
  if (options.hideCursor !== false) output.push("\u001b[?25l");
  // Styles are compared by the code they produce, not by their fields: at a
  // reduced color depth two different colors collapse to the same sequence, and
  // re-emitting it would cost bytes without changing a single cell.
  const defaultCode = styleCode(EMPTY_STYLE, depth);
  const previous = createCell();
  for (const [rowIndex, row] of cells.entries()) {
    let previousLink: string | undefined;
    let previousCode = defaultCode;
    resetCell(previous);
    let line = "";
    for (const cell of row) {
      if (cell.link !== previousLink) {
        if (previousLink !== undefined) line += hyperlinkCode();
        if (cell.link !== undefined) line += hyperlinkCode(cell.link);
        previousLink = cell.link;
      }
      // Neighbouring cells almost always share a style, so the sequence is only
      // rebuilt when the attributes actually change.
      if (!sameCellStyle(cell, previous)) {
        const code = styleCode(cellStyle(cell), depth);
        if (code !== previousCode) {
          line += code;
          previousCode = code;
        }
        copyCellStyle(cell, previous);
      }
      line += cell.char;
    }
    if (previousLink !== undefined) line += hyperlinkCode();
    if (previousCode !== defaultCode) line += "\u001b[0m";
    // Do not rely on LF preserving column zero: terminals differ when a row
    // reaches the right edge and may leave the next row horizontally shifted.
    output.push(rowIndex === 0 ? line : `\u001b[${rowIndex + 1};1H${line}`);
  }
  const mediaOutput = collectMedia(tree, layout, options.mediaProtocol ?? "auto", options.frameIndex ?? 0);
  if (mediaOutput.length > 0) {
    output.push(...mediaOutput);
    output.push("\u001b[H");
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

/**
 * Frame buffers are the largest allocation in a render and their size rarely
 * changes, so one buffer per viewport size is reused across frames. A render
 * that starts while another is still painting (a signal read that renders
 * again) gets its own buffer instead of corrupting the pooled one.
 */
let pooledBuffer: Cell[][] | undefined;
let pooledWidth = -1;
let pooledHeight = -1;
let pooledInUse = false;

function acquireBuffer(width: number, height: number, pooled: boolean): Cell[][] {
  if (pooled && !pooledInUse && pooledBuffer && pooledWidth === width && pooledHeight === height) {
    pooledInUse = true;
    resetBuffer(pooledBuffer);
    return pooledBuffer;
  }
  const buffer = Array.from({ length: height }, () => Array.from({ length: width }, createCell));
  if (pooled && !pooledInUse) {
    pooledBuffer = buffer;
    pooledWidth = width;
    pooledHeight = height;
    pooledInUse = true;
  }
  return buffer;
}

function releaseBuffer(cells: Cell[][], pooled: boolean): void {
  if (pooled && cells === pooledBuffer) pooledInUse = false;
}

function sameCellStyle(cell: Cell, other: Cell): boolean {
  return cell.foreground === other.foreground
    && cell.background === other.background
    && cell.bold === other.bold
    && cell.dim === other.dim
    && cell.italic === other.italic
    && cell.underline === other.underline
    && cell.strikethrough === other.strikethrough;
}

function copyCellStyle(cell: Cell, target: Cell): void {
  target.foreground = cell.foreground;
  target.background = cell.background;
  target.bold = cell.bold;
  target.dim = cell.dim;
  target.italic = cell.italic;
  target.underline = cell.underline;
  target.strikethrough = cell.strikethrough;
}

function resetCell(cell: Cell): void {
  cell.char = " ";
  cell.foreground = undefined;
  cell.background = undefined;
  cell.bold = undefined;
  cell.dim = undefined;
  cell.italic = undefined;
  cell.underline = undefined;
  cell.strikethrough = undefined;
  cell.link = undefined;
}

function createCell(): Cell {
  return {
    char: " ",
    foreground: undefined,
    background: undefined,
    bold: undefined,
    dim: undefined,
    italic: undefined,
    underline: undefined,
    strikethrough: undefined,
    link: undefined
  };
}

function resetBuffer(cells: Cell[][]): void {
  for (const row of cells) {
    for (const cell of row) resetCell(cell);
  }
}

/** Drops the pooled frame buffer. Output is unchanged; only allocation is. */
export function clearFrameBuffer(): void {
  if (pooledInUse) return;
  pooledBuffer = undefined;
  pooledWidth = -1;
  pooledHeight = -1;
}

function paint(tree: ComponentTreeNode, layout: LayoutTreeNode, cells: Cell[][], parentClip: LayoutRect, inherited: TerminalStyle, frameIndex: number, inheritedEffect: EffectSpec | undefined, unicode: boolean): void {
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
  const lines = widgetText(tree, frameIndex).flatMap(line => {
    const safe = sanitizeTerminalText(line);
    return tree.props.wrapText === false ? splitLines(safe) : wrapText(safe, layout.content.width);
  });
  const origin = layout.content;
  for (let index = 0; index < lines.length; index += 1) {
    drawText(cells, origin.x, origin.y + index, lines[index] ?? "", clip, style, effect, frameIndex, index);
  }
  // A linear search per child is quadratic on a wide container; one index per
  // parent keeps painting proportional to the number of nodes.
  const index = childIndex(tree);
  for (const childLayout of layout.children) {
    const child = index.get(childLayout.id);
    if (child) paint(child, childLayout, cells, clip, style, frameIndex, effect, unicode);
  }
  drawBorder(cells, layout.layout, clip, style, tree.props.border, unicode);
}

function collectMedia(tree: ComponentTreeNode | null, layout: LayoutTreeNode | null, protocol: "auto" | "kitty" | "iterm2" | "none", frameIndex: number): string[] {
  if (!tree || !layout) return [];
  const output: string[] = [];
  if (tree.type === "image" || tree.type === "video" || tree.type === "media") {
    const frames = Array.isArray(tree.props.frames) ? tree.props.frames : [];
    const source = tree.type === "video" && frames.length > 0
      ? frames[frameIndex % frames.length]
      : readMediaValue(tree.props.source ?? tree.props.media, tree.props.mimeType);
    const rendered = renderMedia(source, {
      x: layout.content.x,
      y: layout.content.y,
      width: layout.content.width,
      height: layout.content.height,
      protocol: tree.props.protocol === "auto" || tree.props.protocol === "kitty" || tree.props.protocol === "iterm2" || tree.props.protocol === "none" ? tree.props.protocol : protocol
    });
    if (rendered) output.push(rendered);
  }
  const index = childIndex(tree);
  for (const childLayout of layout.children) {
    const child = index.get(childLayout.id);
    if (child) output.push(...collectMedia(child, childLayout, protocol, frameIndex));
  }
  return output;
}

const childIndexCache = new WeakMap<ComponentTreeNode, Map<string | number, ComponentTreeNode>>();

function childIndex(node: ComponentTreeNode): Map<string | number, ComponentTreeNode> {
  const cached = childIndexCache.get(node);
  if (cached) return cached;
  const index = new Map<string | number, ComponentTreeNode>();
  for (const child of node.children) index.set(child.id, child);
  childIndexCache.set(node, index);
  return index;
}

function readMediaValue(value: unknown, mimeType: unknown): MediaSource | string | undefined {
  if (typeof value === "string" && typeof mimeType === "string" && isMimeType(mimeType)) {
    return { data: value, mimeType: mimeType.toLowerCase() };
  }
  if (typeof value === "string") return value;
  if (!isRecord(value)) return undefined;
  return value as unknown as MediaSource;
}

function isMimeType(value: string): boolean {
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/iu.test(value);
}

function drawBorder(cells: Cell[][], rect: LayoutRect, clip: LayoutRect, inherited: TerminalStyle, value: unknown, unicode: boolean): void {
  const border = normalizeBorder(value);
  if (!border || rect.width < 1 || rect.height < 1) return;
  const glyphs = borderGlyphs(border.style, unicode);
  const style = border.color ? { ...inherited, foreground: normalizeHex(border.color) ?? inherited.foreground } : inherited;
  const left = rect.x;
  const top = rect.y;
  const right = rect.x + rect.width - 1;
  const bottom = rect.y + rect.height - 1;
  setCell(cells, left, top, glyphs.topLeft, clip, style);
  setCell(cells, right, top, glyphs.topRight, clip, style);
  setCell(cells, left, bottom, glyphs.bottomLeft, clip, style);
  setCell(cells, right, bottom, glyphs.bottomRight, clip, style);
  for (let x = left + 1; x < right; x += 1) {
    setCell(cells, x, top, glyphs.horizontal, clip, style);
    if (bottom !== top) setCell(cells, x, bottom, glyphs.horizontal, clip, style);
  }
  for (let y = top + 1; y < bottom; y += 1) {
    setCell(cells, left, y, glyphs.vertical, clip, style);
    if (right !== left) setCell(cells, right, y, glyphs.vertical, clip, style);
  }
}

function setCell(cells: Cell[][], x: number, y: number, char: string, clip: LayoutRect, style: TerminalStyle): void {
  if (x < clip.x || y < clip.y || x >= clip.x + clip.width || y >= clip.y + clip.height) return;
  const cell = cells[y]?.[x];
  if (!cell) return;
  cell.char = char;
  applyStyle(cell, style);
}

function normalizeBorder(value: unknown): BorderSpec | undefined {
  if (value === true) return { style: "single" };
  if (!isRecord(value)) return undefined;
  const style = value.style === "single" || value.style === "double" || value.style === "rounded" || value.style === "heavy" ? value.style : "single";
  return { style, color: typeof value.color === "string" ? value.color : undefined };
}

function borderGlyphs(style: BorderSpec["style"], unicode = true): { readonly topLeft: string; readonly topRight: string; readonly bottomLeft: string; readonly bottomRight: string; readonly horizontal: string; readonly vertical: string } {
  // A console without box drawing shows replacement blocks, which is worse than
  // an honest ASCII frame.
  if (!unicode) return { topLeft: "+", topRight: "+", bottomLeft: "+", bottomRight: "+", horizontal: "-", vertical: "|" };
  if (style === "double") return { topLeft: "╔", topRight: "╗", bottomLeft: "╚", bottomRight: "╝", horizontal: "═", vertical: "║" };
  if (style === "rounded") return { topLeft: "╭", topRight: "╮", bottomLeft: "╰", bottomRight: "╯", horizontal: "─", vertical: "│" };
  if (style === "heavy") return { topLeft: "┏", topRight: "┓", bottomLeft: "┗", bottomRight: "┛", horizontal: "━", vertical: "┃" };
  return { topLeft: "┌", topRight: "┐", bottomLeft: "└", bottomRight: "┘", horizontal: "─", vertical: "│" };
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

// The same handful of styles repeat across every cell of every frame, so the
// SGR string is built once per distinct style and depth.
const styleCodeCache = new Map<string, string>();
const MAX_STYLE_CODES = 2048;

function styleCode(style: TerminalStyle, depth: ColorDepth): string {
  const key = `${depth}|${style.foreground ?? ""}|${style.background ?? ""}|${style.bold ? 1 : 0}${style.dim ? 1 : 0}${style.italic ? 1 : 0}${style.underline ? 1 : 0}${style.strikethrough ? 1 : 0}`;
  const cached = styleCodeCache.get(key);
  if (cached !== undefined) return cached;
  const codes: string[] = ["0"];
  if (style.bold) codes.push("1");
  if (style.dim) codes.push("2");
  if (style.italic) codes.push("3");
  if (style.underline) codes.push("4");
  if (style.strikethrough) codes.push("9");
  const foreground = style.foreground ? colorParameters(style.foreground, depth, "foreground") : undefined;
  const background = style.background ? colorParameters(style.background, depth, "background") : undefined;
  if (foreground) codes.push(foreground);
  if (background) codes.push(background);
  const code = `\u001b[${codes.join(";")}m`;
  if (styleCodeCache.size >= MAX_STYLE_CODES) styleCodeCache.clear();
  styleCodeCache.set(key, code);
  return code;
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
