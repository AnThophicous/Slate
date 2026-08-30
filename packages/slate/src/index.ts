import { createRequire } from "node:module";

export const VERSION = "1.5.0" as const;

export type ElementId = string | number;
export type Color = "default" | `#${string}`;
export type KeyCode = string;
export type Modifiers = number;
export type EventResult = "ignored" | "consumed" | "render" | "exit";
export type NodeKind = "container" | "block" | "button";

export interface RenderOptions {
  readonly text: string;
  readonly width?: number;
  readonly height?: number;
  readonly x?: number;
  readonly y?: number;
  readonly foreground?: Color;
  readonly background?: Color;
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
  readonly action?: "press" | "release" | "drag" | "move" | "scroll";
  readonly button?: "left" | "right" | "middle" | "other";
  readonly deltaX?: number;
  readonly deltaY?: number;
}

export interface EffectOptions {
  readonly color: Color;
  readonly to?: Color;
  readonly width?: number;
  readonly height?: number;
  readonly x?: number;
  readonly y?: number;
  readonly radius?: number;
  readonly intensity?: number;
  readonly elapsedMs?: number;
}

export type EventHandler = (event: SlateEvent, node: SlateNode) => EventResult | void;

export interface NodeProps {
  readonly id?: ElementId;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly visible?: boolean;
  readonly focusable?: boolean;
  readonly foreground?: Color;
  readonly background?: Color;
  readonly text?: string;
  readonly placeholder?: string;
  readonly label?: string;
  readonly children?: NodeChild | readonly NodeChild[];
  readonly onEvent?: EventHandler;
  readonly onPress?: EventHandler;
}

export type NodeChild = SlateNode | string | null | false | undefined | readonly NodeChild[];

export interface SlateNode {
  readonly kind: NodeKind;
  readonly id: ElementId;
  props: NodeProps;
  readonly children: SlateNode[];
}

interface NativeBinding {
  render(options: RenderOptions): string;
  renderText(text: string): string;
  renderGlow?(options: { text: string; color: string; to?: string; width?: number; height?: number; x?: number; y?: number; radius?: number; intensity?: number; elapsedMs?: number }): string;
  renderColorShift?(options: { text: string; color: string; to?: string; width?: number; height?: number; x?: number; y?: number; radius?: number; intensity?: number; elapsedMs?: number }): string;
  enableRawMode?(): void;
  disableRawMode?(): void;
  enableMouseCapture?(): void;
  disableMouseCapture?(): void;
  enableBracketedPaste?(): void;
  disableBracketedPaste?(): void;
  enableFocusChange?(): void;
  disableFocusChange?(): void;
  pollEvent?(timeoutMs?: number): SlateEvent | null;
}

const require = createRequire(import.meta.url);
let cachedNative: NativeBinding | null | undefined;
let generatedId = 0;

function native(): NativeBinding | undefined {
  if (cachedNative !== undefined) return cachedNative ?? undefined;
  for (const name of ["@slate-terminal/native", "slate-node"]) {
    try {
      cachedNative = require(name) as NativeBinding;
      if (typeof cachedNative.render === "function") return cachedNative;
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
  validate(all);
  const binding = native();
  return binding && Object.keys(options).length === 0 ? binding.renderText(text) : binding?.render(all) ?? renderFallback(all);
}

export function glow(text: string, options: EffectOptions): string {
  validateEffect(text, options);
  validate({ text, ...options });
  hex(options.color);
  const binding = native();
  if (binding?.renderGlow) return binding.renderGlow({ text, color: hex(options.color), to: options.to === undefined ? undefined : hex(options.to), width: options.width, height: options.height, x: options.x, y: options.y, radius: options.radius, intensity: options.intensity, elapsedMs: options.elapsedMs });
  return render({ text, foreground: hex(options.color), width: options.width, height: options.height, x: options.x, y: options.y });
}

export function colorShift(text: string, options: EffectOptions & { readonly to: Color }): string {
  validateEffect(text, options);
  validate({ text, ...options });
  hex(options.color);
  hex(options.to);
  const binding = native();
  if (binding?.renderColorShift) return binding.renderColorShift({ text, color: hex(options.color), to: hex(options.to), width: options.width, height: options.height, x: options.x, y: options.y, elapsedMs: options.elapsedMs });
  return render({ text, foreground: hex(options.to), width: options.width, height: options.height, x: options.x, y: options.y });
}

export function hex(value: string): Color {
  if (/^#[0-9a-fA-F]{3}$/.test(value)) return (`#${value.slice(1).split("").map(char => char + char).join("")}`) as Color;
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value as Color;
  throw new TypeError("cor deve usar #RGB ou #RRGGBB");
}

export function inkRender(text: string, options: Omit<RenderOptions, "text"> = {}): string { return renderText(text, options); }

export function createInkAdapter(defaults: Omit<RenderOptions, "text"> = {}) {
  return (text: string, options: Omit<RenderOptions, "text"> = {}) => renderText(text, { ...defaults, ...options });
}

export function enableMouseCapture(): void {
  const binding = native();
  if (!binding?.enableMouseCapture) throw new Error("Binding nativo da Slate não encontrado; compile slate-node primeiro.");
  binding.enableMouseCapture();
}

export function enableRawMode(): void {
  const binding = native();
  if (!binding?.enableRawMode) throw new Error("Binding nativo da Slate não encontrado; compile slate-node primeiro.");
  binding.enableRawMode();
}

export function disableRawMode(): void { native()?.disableRawMode?.(); }
export function disableMouseCapture(): void { native()?.disableMouseCapture?.(); }
export function enableBracketedPaste(): void {
  const binding = native();
  if (!binding?.enableBracketedPaste) throw new Error("Binding nativo da Slate não encontrado; compile slate-node primeiro.");
  binding.enableBracketedPaste();
}
export function disableBracketedPaste(): void { native()?.disableBracketedPaste?.(); }
export function enableFocusChange(): void {
  const binding = native();
  if (!binding?.enableFocusChange) throw new Error("Binding nativo da Slate não encontrado; compile slate-node primeiro.");
  binding.enableFocusChange();
}
export function disableFocusChange(): void { native()?.disableFocusChange?.(); }
export function pollEvent(timeoutMs = 16): SlateEvent | null { return native()?.pollEvent?.(timeoutMs) ?? null; }

export function createContainer(props: NodeProps = {}): SlateNode { return createNode("container", props); }
export function createBlock(props: NodeProps = {}): SlateNode { return createNode("block", props); }
export function createButton(props: NodeProps = {}): SlateNode { return createNode("button", { ...props, focusable: props.focusable ?? true }); }

export function Container(props: NodeProps = {}): SlateNode { return createContainer(props); }
export function Block(props: NodeProps = {}): SlateNode { return createBlock(props); }
export function Button(props: NodeProps = {}): SlateNode { return createButton(props); }
export const Fragment = Symbol.for("slate.fragment");

export function renderNode(node: SlateNode, options: Omit<RenderOptions, "text"> = {}): string {
  const text = flattenText(node);
  return renderText(text, options);
}

export class SlateApp {
  readonly root: SlateNode;
  private focusedId: ElementId | undefined;

  constructor(root: SlateNode) { this.root = root; }
  find(id: ElementId): SlateNode | undefined { return findNode(this.root, id); }
  focus(id: ElementId): boolean {
    const node = this.find(id);
    if (!node?.props.focusable) return false;
    this.focusedId = id;
    return true;
  }
  focused(): ElementId | undefined { return this.focusedId; }
  update(id: ElementId, patch: NodeProps): boolean {
    const node = this.find(id);
    if (!node) return false;
    node.props = { ...node.props, ...patch, id: node.id } as NodeProps;
    if (patch.children !== undefined) node.children.splice(0, node.children.length, ...normalizeChildren(patch.children));
    return true;
  }
  append(parentId: ElementId, child: SlateNode): boolean {
    const parent = this.find(parentId);
    if (!parent || parent.kind === "block" || this.find(child.id) || hasDuplicateIds(child, new Set())) return false;
    parent.children.push(child);
    return true;
  }
  remove(id: ElementId): SlateNode | undefined {
    if (this.root.id === id) return undefined;
    const parent = findParent(this.root, id);
    if (!parent) return undefined;
    const index = parent.children.findIndex(child => child.id === id);
    if (index < 0) return undefined;
    const [removed] = parent.children.splice(index, 1);
    if (this.focusedId !== undefined && !this.find(this.focusedId)) this.focusedId = undefined;
    return removed;
  }
  setText(id: ElementId, text: string): boolean { return this.update(id, { text }); }
  setPlaceholder(id: ElementId, placeholder: string): boolean { return this.update(id, { placeholder }); }
  setForeground(id: ElementId, foreground: Color): boolean { return this.update(id, { foreground: foreground === "default" ? foreground : hex(foreground) }); }
  dispatch(event: SlateEvent): EventResult {
    const path = event.kind === "mouse" && event.x !== undefined && event.y !== undefined ? hitPath(this.root, event.x, event.y) : this.focusedId === undefined ? [this.root] : pathTo(this.root, this.focusedId) ?? [this.root];
    for (const node of path) {
      const result = node.props.onEvent?.(event, node);
      if (result && result !== "ignored") return result;
      const activatesButton = node.kind === "button" && ((event.kind === "mouse" && event.action === "press") || (event.kind === "key" && (event.code === "Enter" || event.code === " " || event.code === "Space")));
      if (activatesButton) {
        const pressed = node.props.onPress?.(event, node);
        if (pressed && pressed !== "ignored") return pressed;
        return "render";
      }
    }
    return "ignored";
  }
  render(options: Omit<RenderOptions, "text"> = {}): string { return renderNode(this.root, options); }
}

export function createApp(root: SlateNode): SlateApp { return new SlateApp(root); }

function createNode(kind: NodeKind, props: NodeProps): SlateNode {
  const id = props.id ?? `slate-${++generatedId}`;
  return { kind, id, props: { ...props, id }, children: normalizeChildren(props.children) };
}

function normalizeChildren(children: NodeProps["children"]): SlateNode[] {
  const values = Array.isArray(children) ? children : children === undefined ? [] : [children];
  return values.flatMap(value => Array.isArray(value) ? normalizeChildren(value) : typeof value === "string" ? [createBlock({ text: value })] : value ? [value] : []);
}

function findNode(node: SlateNode, id: ElementId): SlateNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children) {
    const result = findNode(child, id);
    if (result) return result;
  }
  return undefined;
}

function findParent(node: SlateNode, id: ElementId): SlateNode | undefined {
  if (node.children.some(child => child.id === id)) return node;
  for (const child of node.children) {
    const result = findParent(child, id);
    if (result) return result;
  }
  return undefined;
}

function flattenText(node: SlateNode): string {
  if (node.props.visible === false) return "";
  const own = node.kind === "button" ? node.props.label ?? node.props.text ?? "" : node.props.text || node.props.placeholder || "";
  const children = node.children.map(flattenText).filter(Boolean);
  return [own, ...children].filter(Boolean).join("\n");
}

function bounds(node: SlateNode): { x: number; y: number; width: number; height: number } {
  const text = node.kind === "button" ? node.props.label ?? node.props.text ?? "" : node.props.text || node.props.placeholder || "";
  const x = node.props.x ?? 0;
  const y = node.props.y ?? 0;
  const children = node.children.map(bounds);
  const childRight = Math.max(x + 1, ...children.map(child => child.x + child.width));
  const childBottom = Math.max(y + 1, ...children.map(child => child.y + child.height));
  return { x, y, width: node.props.width ?? Math.max(1, displayWidth(text), childRight - x), height: node.props.height ?? Math.max(1, text.split("\n").length, childBottom - y) };
}

function hasDuplicateIds(node: SlateNode, ids: Set<ElementId>): boolean {
  if (ids.has(node.id)) return true;
  ids.add(node.id);
  return node.children.some(child => hasDuplicateIds(child, ids));
}

function hitPath(node: SlateNode, x: number, y: number): SlateNode[] {
  const area = bounds(node);
  if (node.props.visible === false || x < area.x || y < area.y || x >= area.x + area.width || y >= area.y + area.height) return [];
  for (let index = node.children.length - 1; index >= 0; index -= 1) {
    const childPath = hitPath(node.children[index], x, y);
    if (childPath.length > 0) return [...childPath, node];
  }
  return [node];
}

function pathTo(node: SlateNode, id: ElementId): SlateNode[] | undefined {
  if (node.id === id) return [node];
  for (const child of node.children) {
    const path = pathTo(child, id);
    if (path) return [...path, node];
  }
  return undefined;
}

function displayWidth(value: string): number {
  return [...value].reduce((width, character) => {
    const code = character.codePointAt(0)!;
    if ((code >= 0x300 && code <= 0x36f) || (code >= 0xfe00 && code <= 0xfe0f)) return width;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return width;
    const wide = code >= 0x1100 && (code <= 0x115f || code === 0x2329 || code === 0x232a || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe10 && code <= 0xfe19) || (code >= 0xff01 && code <= 0xff60) || code >= 0x1f300);
    return width + (wide ? 2 : 1);
  }, 0);
}

function validate(options: RenderOptions): void {
  for (const key of ["width", "height", "x", "y"] as const) {
    const value = options[key];
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) throw new RangeError(`${key} deve ser um inteiro não negativo`);
  }
  if (options.foreground !== undefined && options.foreground !== "default") hex(options.foreground);
  if (options.background !== undefined && options.background !== "default") hex(options.background);
}

function renderFallback(options: RenderOptions): string {
  const lines = options.text.split("\n");
  const width = Math.max(1, options.width ?? Math.max(1, ...lines.map(displayWidth)));
  const height = Math.max(1, options.height ?? Math.max(1, lines.length));
  const x = options.x ?? 0;
  const y = options.y ?? 0;
  let output = "\x1b[2J\x1b[H\x1b[?25l";
  const foreground = options.foreground && options.foreground !== "default" ? colorSequence(options.foreground, 38) : "\x1b[39m";
  const background = options.background && options.background !== "default" ? colorSequence(options.background, 48) : "\x1b[49m";
  for (let row = 0; row < height; row += 1) {
    const line = lines[row - y] ?? "";
    if (row < y || row - y >= lines.length) continue;
    output += `\x1b[${row + 1};${x + 1}H${foreground}${background}${[...line].slice(0, Math.max(0, width - x)).join("")}`;
  }
  return `${output}\x1b[0m`;
}

function colorSequence(color: Color, code: number): string {
  return `\x1b[${code};2;${parseInt(color.slice(1, 3), 16)};${parseInt(color.slice(3, 5), 16)};${parseInt(color.slice(5, 7), 16)}m`;
}

function validateEffect(text: string, options: EffectOptions): void {
  validate({ text, width: options.width, height: options.height, x: options.x, y: options.y });
  hex(options.color);
  if (options.to !== undefined) hex(options.to);
  for (const key of ["radius", "intensity", "elapsedMs"] as const) {
    const value = options[key];
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) throw new RangeError(`${key} deve ser um inteiro não negativo`);
  }
}
