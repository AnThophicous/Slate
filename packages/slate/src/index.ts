import { createRequire } from "node:module";

export const VERSION = "2.2.2" as const;

export type ElementId = string | number;
export type Color = "default" | `#${string}`;
export type KeyCode = string;
export type KeyPhase = "press" | "repeat" | "release";
export type Modifiers = number;
export type EventResult = "ignored" | "consumed" | "render" | "exit";
export type FlexDimension = number | `${number}%` | "auto";
export type FlexDirection = "row" | "column";
export type FlexWrap = "nowrap" | "wrap" | "wrap-reverse";
export type JustifyContent = "flex-start" | "center" | "flex-end" | "space-between" | "space-around" | "space-evenly";
export type AlignItems = "stretch" | "flex-start" | "center" | "flex-end";
export type Overflow = "visible" | "hidden" | "scroll" | "auto";
export type NodeKind = "container" | "block" | "button" | "text" | "input" | "select" | "checkbox" | "tabs" | "table" | "spinner" | "progress" | "modal" | "scrollView" | "list" | "form";

export interface ReadableSignal<T> {
  readonly __slateSignal: true;
  readonly get: () => T;
  readonly peek: () => T;
  readonly subscribe: (listener: () => void) => () => void;
}

export interface WritableSignal<T> extends ReadableSignal<T> {
  readonly set: (value: T | ((previous: T) => T)) => void;
  readonly update: (value: T | ((previous: T) => T)) => void;
}

interface Observer {
  readonly run: () => void;
  readonly dependencies: Set<ReadableSignal<unknown>>;
  readonly cleanups: Set<() => void>;
  active: boolean;
}

let activeObserver: Observer | undefined;
let batchDepth = 0;
const pendingSubscribers = new Set<() => void>();

export function signal<T>(initial: T): WritableSignal<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  const result: WritableSignal<T> = {
    __slateSignal: true,
    get: () => {
      activeObserver?.dependencies.add(result as ReadableSignal<unknown>);
      return value;
    },
    peek: () => value,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    set: action => {
      const next = typeof action === "function" ? (action as (previous: T) => T)(value) : action;
      if (Object.is(value, next)) return;
      value = next;
      for (const listener of [...listeners]) {
        if (batchDepth > 0) pendingSubscribers.add(listener);
        else listener();
      }
    },
    update: action => result.set(action)
  };
  return result;
}

export function computed<T>(derive: () => T): ReadableSignal<T> {
  const state = signal(derive());
  effect(() => state.set(derive()));
  return { __slateSignal: true, get: state.get, peek: state.peek, subscribe: state.subscribe };
}

export function effect(run: () => void): () => void {
  let observer: Observer;
  const execute = () => {
    if (!observer.active) return;
    for (const cleanup of observer.cleanups) cleanup();
    observer.cleanups.clear();
    observer.dependencies.clear();
    const previous = activeObserver;
    activeObserver = observer;
    try {
      run();
    } finally {
      activeObserver = previous;
    }
    for (const dependency of observer.dependencies) observer.cleanups.add(dependency.subscribe(observer.run));
  };
  observer = {
    run: execute,
    dependencies: new Set(),
    cleanups: new Set(),
    active: true
  };
  execute();
  return () => {
    if (!observer.active) return;
    observer.active = false;
    for (const cleanup of observer.cleanups) cleanup();
    observer.cleanups.clear();
    observer.dependencies.clear();
  };
}

export function batch(run: () => void): void {
  batchDepth += 1;
  try {
    run();
  } finally {
    batchDepth -= 1;
    if (batchDepth === 0) {
      const subscribers = [...pendingSubscribers];
      pendingSubscribers.clear();
      for (const subscriber of subscribers) subscriber();
    }
  }
}

export function untracked<T>(run: () => T): T {
  const previous = activeObserver;
  activeObserver = undefined;
  try {
    return run();
  } finally {
    activeObserver = previous;
  }
}

export function isSignal(value: unknown): value is ReadableSignal<unknown> {
  return typeof value === "object" && value !== null && (value as ReadableSignal<unknown>).__slateSignal === true && typeof (value as ReadableSignal<unknown>).get === "function";
}

export function readReactive<T>(value: T | ReadableSignal<T>): T {
  return isSignal(value) ? value.get() as T : value;
}

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
  readonly kind: "key" | "mouse" | "resize" | "paste" | "focusGained" | "focusLost" | "ime";
  readonly code?: string;
  readonly text?: string;
  readonly phase?: KeyPhase;
  readonly modifiers?: number;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly action?: "press" | "release" | "drag" | "move" | "scroll";
  readonly button?: "left" | "right" | "middle" | "other";
  readonly deltaX?: number;
  readonly deltaY?: number;
  readonly target?: ElementId;
}

export interface FlexStyle {
  readonly display?: "flex" | "none";
  readonly flexDirection?: FlexDirection;
  readonly flexWrap?: FlexWrap;
  readonly flexGrow?: number;
  readonly flexShrink?: number;
  readonly flexBasis?: FlexDimension;
  readonly width?: FlexDimension;
  readonly height?: FlexDimension;
  readonly minWidth?: FlexDimension;
  readonly maxWidth?: FlexDimension;
  readonly minHeight?: FlexDimension;
  readonly maxHeight?: FlexDimension;
  readonly gap?: FlexDimension;
  readonly rowGap?: FlexDimension;
  readonly columnGap?: FlexDimension;
  readonly padding?: FlexDimension;
  readonly margin?: FlexDimension;
  readonly justifyContent?: JustifyContent;
  readonly alignItems?: AlignItems;
  readonly alignSelf?: AlignItems | "auto";
  readonly overflow?: Overflow;
  readonly scrollLeft?: number;
  readonly scrollTop?: number;
}

export interface SelectOption {
  readonly label: string;
  readonly value?: string;
  readonly disabled?: boolean;
}

export interface TableColumn {
  readonly key: string;
  readonly title?: string;
  readonly width?: number | `${number}%`;
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
  readonly key?: string | number;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly visible?: boolean;
  readonly disabled?: boolean;
  readonly focusable?: boolean;
  readonly capturePointer?: boolean;
  readonly foreground?: Color;
  readonly background?: Color;
  readonly style?: FlexStyle;
  readonly direction?: FlexDirection;
  readonly wrap?: FlexWrap;
  readonly gap?: FlexDimension;
  readonly flexGrow?: number;
  readonly flexShrink?: number;
  readonly flexBasis?: FlexDimension;
  readonly minWidth?: FlexDimension;
  readonly maxWidth?: FlexDimension;
  readonly minHeight?: FlexDimension;
  readonly maxHeight?: FlexDimension;
  readonly justifyContent?: JustifyContent;
  readonly alignItems?: AlignItems;
  readonly alignSelf?: AlignItems | "auto";
  readonly overflow?: Overflow;
  readonly overflowX?: Overflow;
  readonly overflowY?: Overflow;
  readonly scrollLeft?: number;
  readonly scrollTop?: number;
  readonly text?: string;
  readonly placeholder?: string;
  readonly label?: string;
  readonly onHover?: EventHandler;
  readonly value?: string | number | boolean | ReadableSignal<string | number | boolean>;
  readonly defaultValue?: string | number | boolean;
  readonly options?: readonly SelectOption[];
  readonly selectedIndex?: number | ReadableSignal<number>;
  readonly checked?: boolean | ReadableSignal<boolean>;
  readonly activeIndex?: number | ReadableSignal<number>;
  readonly tabs?: readonly string[];
  readonly rows?: readonly (readonly (string | number)[] | Record<string, string | number>)[];
  readonly columns?: readonly TableColumn[];
  readonly items?: readonly (string | number)[];
  readonly progress?: number | ReadableSignal<number>;
  readonly spinning?: boolean | ReadableSignal<boolean>;
  readonly open?: boolean | ReadableSignal<boolean>;
  readonly title?: string | ReadableSignal<string>;
  readonly cursor?: number | ReadableSignal<number>;
  readonly children?: NodeChild | readonly NodeChild[];
  readonly onEvent?: EventHandler;
  readonly onKey?: EventHandler;
  readonly onMouse?: EventHandler;
  readonly onPaste?: EventHandler;
  readonly onResize?: EventHandler;
  readonly onIme?: EventHandler;
  readonly onPress?: EventHandler;
  readonly onChange?: (value: string | number | boolean, node: SlateNode) => EventResult | void;
  readonly onSubmit?: (value: string, node: SlateNode) => EventResult | void;
  readonly onFocus?: (node: SlateNode) => EventResult | void;
  readonly onBlur?: (node: SlateNode) => EventResult | void;
  readonly onScroll?: (x: number, y: number, node: SlateNode) => EventResult | void;
}

export type NodeChild = SlateNode | string | number | boolean | null | undefined | ReadableSignal<unknown> | readonly NodeChild[];

export interface SlateNode {
  readonly kind: NodeKind;
  readonly id: ElementId;
  props: NodeProps;
  readonly children: SlateNode[];
}

interface NativeBinding {
  version?(): string;
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
  enableAlternateScreen?(): void;
  disableAlternateScreen?(): void;
  clearScreen?(): void;
  hideCursor?(): void;
  showCursor?(): void;
  closeTerminal?(): void;
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

export function version(): string { return native()?.version?.() ?? VERSION; }

export function render(options: RenderOptions): string {
  const safe = { ...options, text: sanitizeTerminalText(options.text) };
  validate(safe);
  return native()?.render(safe) ?? renderFallback(safe);
}

export function renderText(text: string, options: Omit<RenderOptions, "text"> = {}): string {
  const all = { ...options, text: sanitizeTerminalText(text) };
  validate(all);
  const binding = native();
  return binding && Object.keys(options).length === 0 ? binding.renderText(all.text) : binding?.render(all) ?? renderFallback(all);
}

export function glow(text: string, options: EffectOptions): string {
  validateEffect(text, options);
  validate({ text, ...options });
  hex(options.color);
  const safeText = sanitizeTerminalText(text);
  const binding = native();
  if (binding?.renderGlow) return binding.renderGlow({ text: safeText, color: hex(options.color), to: options.to === undefined ? undefined : hex(options.to), width: options.width, height: options.height, x: options.x, y: options.y, radius: options.radius, intensity: options.intensity, elapsedMs: options.elapsedMs });
  return render({ text: safeText, foreground: hex(options.color), width: options.width, height: options.height, x: options.x, y: options.y });
}

export function colorShift(text: string, options: EffectOptions & { readonly to: Color }): string {
  validateEffect(text, options);
  validate({ text, ...options });
  hex(options.color);
  hex(options.to);
  const safeText = sanitizeTerminalText(text);
  const binding = native();
  if (binding?.renderColorShift) return binding.renderColorShift({ text: safeText, color: hex(options.color), to: hex(options.to), width: options.width, height: options.height, x: options.x, y: options.y, elapsedMs: options.elapsedMs });
  return render({ text: safeText, foreground: hex(options.to), width: options.width, height: options.height, x: options.x, y: options.y });
}

export function hex(value: string): Color {
  if (/^#[0-9a-fA-F]{3}$/.test(value)) return (`#${value.slice(1).split("").map(char => char + char).join("")}`) as Color;
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value as Color;
  throw new TypeError("cor deve usar #RGB ou #RRGGBB");
}

export type LegacyTextRenderer = (text: string, options?: Omit<RenderOptions, "text">) => string;

/** Keeps old `(text, options) => ANSI` renderers usable during migration. */
export function createLegacyRendererAdapter(renderer: LegacyTextRenderer = renderText, defaults: Omit<RenderOptions, "text"> = {}): LegacyTextRenderer {
  return (text, options = {}) => renderer(text, { ...defaults, ...options });
}

export function inkRender(text: string, options: Omit<RenderOptions, "text"> = {}): string { return renderText(text, options); }

export function createInkAdapter(defaults: Omit<RenderOptions, "text"> = {}) {
  return createLegacyRendererAdapter(renderText, defaults);
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
export function enableAlternateScreen(): void {
  const binding = native();
  if (!binding?.enableAlternateScreen) throw new Error("Binding nativo da Slate não encontrado; compile slate-node primeiro.");
  binding.enableAlternateScreen();
}
export function disableAlternateScreen(): void { native()?.disableAlternateScreen?.(); }
export function clearScreen(): void { native()?.clearScreen?.(); }
export function hideCursor(): void { native()?.hideCursor?.(); }
export function showCursor(): void { native()?.showCursor?.(); }
/** Restores cursor, raw mode, mouse/paste/focus capture and alternate screen. */
export function closeTerminal(): void { native()?.closeTerminal?.(); }
export function pollEvent(timeoutMs = 16): SlateEvent | null { return native()?.pollEvent?.(timeoutMs) ?? null; }
export interface TerminalSessionOptions {
  readonly alternateScreen?: boolean;
  readonly rawMode?: boolean;
  readonly mouse?: boolean;
  readonly bracketedPaste?: boolean;
  readonly focusChange?: boolean;
}

export interface TerminalSession {
  readonly input: ReturnType<typeof createInputSource>;
  readonly close: () => void;
}

/** Opens all interactive terminal capabilities atomically and supplies one cleanup path. */
export function createTerminalSession(options: TerminalSessionOptions = {}): TerminalSession {
  const enabled = {
    alternateScreen: options.alternateScreen ?? true,
    rawMode: options.rawMode ?? true,
    mouse: options.mouse ?? true,
    bracketedPaste: options.bracketedPaste ?? true,
    focusChange: options.focusChange ?? true
  };
  try {
    if (enabled.alternateScreen) enableAlternateScreen();
    if (enabled.rawMode) enableRawMode();
    if (enabled.mouse) enableMouseCapture();
    if (enabled.bracketedPaste) enableBracketedPaste();
    if (enabled.focusChange) enableFocusChange();
  } catch (error) {
    try { closeTerminal(); } catch { /* rollback is best effort */ }
    throw error;
  }
  const input = createInputSource();
  let closed = false;
  return {
    input,
    close: () => {
      if (closed) return;
      closed = true;
      try { input.close(); } catch { try { closeTerminal(); } catch { /* terminal may already be gone */ } }
    }
  };
}

export function createInputSource(): { readonly poll: (timeoutMs?: number) => SlateEvent | null; readonly close: () => void; readonly size: () => { readonly width: number; readonly height: number } } {
  return { poll: pollEvent, close: closeTerminal, size: terminalSize };
}

function terminalSize(): { readonly width: number; readonly height: number } {
  const processLike = (globalThis as typeof globalThis & { process?: { stdout?: { columns?: number; rows?: number } } }).process;
  return {
    width: Number.isFinite(processLike?.stdout?.columns) ? Math.max(0, Math.trunc(processLike?.stdout?.columns as number)) : 80,
    height: Number.isFinite(processLike?.stdout?.rows) ? Math.max(0, Math.trunc(processLike?.stdout?.rows as number)) : 24
  };
}

export function createContainer(props: NodeProps = {}): SlateNode { return createNode("container", props); }
export function createBlock(props: NodeProps = {}): SlateNode { return createNode("block", props); }
export function createButton(props: NodeProps = {}): SlateNode { return createNode("button", { ...props, focusable: props.focusable ?? true, capturePointer: props.capturePointer ?? true }); }
export function createText(props: NodeProps = {}): SlateNode { return createNode("text", props); }
export function createInput(props: NodeProps = {}): SlateNode { return createNode("input", { ...props, focusable: props.focusable ?? true, capturePointer: props.capturePointer ?? true }); }
export function createSelect(props: NodeProps = {}): SlateNode { return createNode("select", { ...props, focusable: props.focusable ?? true, capturePointer: props.capturePointer ?? true }); }
export function createCheckbox(props: NodeProps = {}): SlateNode { return createNode("checkbox", { ...props, focusable: props.focusable ?? true, capturePointer: props.capturePointer ?? true }); }
export function createTabs(props: NodeProps = {}): SlateNode { return createNode("tabs", { ...props, focusable: props.focusable ?? true, capturePointer: props.capturePointer ?? true }); }
export function createTable(props: NodeProps = {}): SlateNode { return createNode("table", props); }
export function createSpinner(props: NodeProps = {}): SlateNode { return createNode("spinner", props); }
export function createProgress(props: NodeProps = {}): SlateNode { return createNode("progress", props); }
export function createModal(props: NodeProps = {}): SlateNode { return createNode("modal", props); }
export function createScrollView(props: NodeProps = {}): SlateNode { return createNode("scrollView", { ...props, overflow: props.overflow ?? "scroll", capturePointer: props.capturePointer ?? true }); }
export function createList(props: NodeProps = {}): SlateNode { return createNode("list", { ...props, capturePointer: props.capturePointer ?? true }); }
export function createForm(props: NodeProps = {}): SlateNode { return createNode("form", props); }

export function Container(props: NodeProps = {}): SlateNode { return createContainer(props); }
export function Block(props: NodeProps = {}): SlateNode { return createBlock(props); }
export function Button(props: NodeProps = {}): SlateNode { return createButton(props); }
export function Text(props: NodeProps = {}): SlateNode { return createText(props); }
export function Input(props: NodeProps = {}): SlateNode { return createInput(props); }
export function Select(props: NodeProps = {}): SlateNode { return createSelect(props); }
export function Checkbox(props: NodeProps = {}): SlateNode { return createCheckbox(props); }
export function Tabs(props: NodeProps = {}): SlateNode { return createTabs(props); }
export function Table(props: NodeProps = {}): SlateNode { return createTable(props); }
export function Spinner(props: NodeProps = {}): SlateNode { return createSpinner(props); }
export function Progress(props: NodeProps = {}): SlateNode { return createProgress(props); }
export function Modal(props: NodeProps = {}): SlateNode { return createModal(props); }
export function ScrollView(props: NodeProps = {}): SlateNode { return createScrollView(props); }
export function List(props: NodeProps = {}): SlateNode { return createList(props); }
export function Form(props: NodeProps = {}): SlateNode { return createForm(props); }
export const Fragment = Symbol.for("slate.fragment");

export function renderNode(node: SlateNode, options: Omit<RenderOptions, "text"> = {}): string {
  const text = flattenText(node);
  return renderText(text, options);
}

export class SlateApp<S = unknown> {
  readonly root: SlateNode;
  private focusedId: ElementId | undefined;
  private hoveredId: ElementId | undefined;
  private pointerCapturedId: ElementId | undefined;
  private stateValue: S | undefined;
  private readonly stateListeners = new Set<() => void>();

  constructor(root: SlateNode, initialState?: S) {
    if (hasDuplicateIds(root, new Set())) throw new RangeError("IDs Slate duplicados");
    this.root = root;
    this.stateValue = initialState;
  }
  getState(): S | undefined { return this.stateValue; }
  setState(action: S | ((previous: S | undefined) => S)): void {
    const next = typeof action === "function" ? (action as (previous: S | undefined) => S)(this.stateValue) : action;
    if (Object.is(this.stateValue, next)) return;
    this.stateValue = next;
    for (const listener of [...this.stateListeners]) listener();
  }
  subscribe(listener: () => void): () => void { this.stateListeners.add(listener); return () => this.stateListeners.delete(listener); }
  find(id: ElementId): SlateNode | undefined { return findNode(this.root, id); }
  focus(id: ElementId): boolean {
    const node = this.find(id);
    if (!node?.props.focusable || node.props.disabled === true) return false;
    if (this.focusedId === id) return true;
    const previous = this.focusedId;
    this.focusedId = id;
    if (previous !== undefined) {
      const previousNode = this.find(previous);
      previousNode?.props.onBlur?.(previousNode);
    }
    node.props.onFocus?.(node);
    return true;
  }
  focused(): ElementId | undefined { return this.focusedId; }
  focusNext(reverse = false): ElementId | undefined {
    const ids = focusableIds(this.root);
    if (ids.length === 0) return undefined;
    const current = this.focusedId === undefined ? (reverse ? 0 : -1) : ids.indexOf(this.focusedId);
    const index = (current + (reverse ? -1 : 1) + ids.length) % ids.length;
    const next = ids[index];
    if (next !== undefined) this.focus(next);
    return this.focusedId;
  }
  blur(): void {
    const previous = this.focusedId;
    this.focusedId = undefined;
    if (previous !== undefined) {
      const previousNode = this.find(previous);
      previousNode?.props.onBlur?.(previousNode);
    }
  }
  edit(id: ElementId, patch: NodeProps): boolean { return this.update(id, patch); }
  update(id: ElementId, patch: NodeProps): boolean {
    const node = this.find(id);
    if (!node) return false;
    const previousProps = node.props;
    node.props = { ...node.props, ...patch, id: node.id } as NodeProps;
    if (patch.children !== undefined) {
      const children = normalizeChildren(patch.children);
      const previous = node.children.splice(0, node.children.length, ...children);
      if (hasDuplicateIds(this.root, new Set())) {
        node.props = previousProps;
        node.children.splice(0, node.children.length, ...previous);
        return false;
      }
    }
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
    if (this.hoveredId !== undefined && !this.find(this.hoveredId)) this.hoveredId = undefined;
    if (this.pointerCapturedId !== undefined && !this.find(this.pointerCapturedId)) this.pointerCapturedId = undefined;
    return removed;
  }
  setText(id: ElementId, text: string): boolean { return this.update(id, { text }); }
  setPlaceholder(id: ElementId, placeholder: string): boolean { return this.update(id, { placeholder }); }
  setForeground(id: ElementId, foreground: Color): boolean { return this.update(id, { foreground: foreground === "default" ? foreground : hex(foreground) }); }
  dispatch(event: SlateEvent): EventResult {
    if (event.kind === "key" && event.phase !== "release" && isCtrlC(event)) {
      this.pointerCapturedId = undefined;
      return "exit";
    }
    if (event.kind === "key" && event.phase !== "release" && event.code === "Tab") {
      this.focusNext((event.modifiers ?? 0) & 1 ? true : false);
      return "consumed";
    }
    const pointMouse = event.kind === "mouse" && event.x !== undefined && event.y !== undefined;
    const mouseX = event.x;
    const mouseY = event.y;
    const hit = pointMouse && mouseX !== undefined && mouseY !== undefined ? hitPath(this.root, mouseX, mouseY) : [];
    const capturedNode = pointMouse && this.pointerCapturedId !== undefined ? this.find(this.pointerCapturedId) : undefined;
    if (capturedNode?.props.visible === false || capturedNode?.props.disabled === true) this.pointerCapturedId = undefined;
    const captured = pointMouse && this.pointerCapturedId !== undefined ? pathTo(this.root, this.pointerCapturedId) : undefined;
    const path = pointMouse ? captured ?? hit : this.focusedId === undefined ? [this.root] : pathTo(this.root, this.focusedId) ?? [this.root];
    if (pointMouse) event = { ...event, target: path[0]?.id };
    if (event.kind === "mouse" && event.action === "press") {
      const target = path.find(node => node.props.focusable === true && node.props.disabled !== true);
      if (target) this.focus(target.id);
      const capture = path.find(node => node.props.capturePointer === true) ?? target;
      if (capture && capture.props.disabled !== true) this.pointerCapturedId = capture.id;
    }
    if (event.kind === "mouse" && event.action === "move") {
      const nextHovered = hit.find(node => node.props.onHover !== undefined && node.props.disabled !== true)?.id;
      if (nextHovered !== this.hoveredId) {
        const previousHovered = this.hoveredId;
        this.hoveredId = nextHovered;
        let hoverResult: EventResult = "ignored";
        for (const id of [previousHovered, nextHovered]) {
          if (id === undefined) continue;
          const node = this.find(id);
          const result = node?.props.onHover?.(event, node);
          if (result && result !== "ignored") hoverResult = result;
        }
        if (hoverResult !== "ignored") return hoverResult;
      }
    }
    try {
      for (const node of path) {
        if (node.props.disabled === true) continue;
        const result = node.props.onEvent?.(event, node);
        if (result && result !== "ignored") return result;
        const specific = event.kind === "key" ? node.props.onKey : event.kind === "mouse" ? node.props.onMouse : event.kind === "paste" ? node.props.onPaste : event.kind === "resize" ? node.props.onResize : event.kind === "ime" ? node.props.onIme : undefined;
        const specificResult = specific?.(event, node);
        if (specificResult && specificResult !== "ignored") return specificResult;
        const activatesButton = node.kind === "button" && ((event.kind === "mouse" && event.action === "press" && (event.button === undefined || event.button === "left")) || (event.kind === "key" && event.phase !== "release" && (event.code === "Enter" || event.code === " " || event.code === "Space")));
        if (activatesButton) {
          const pressed = node.props.onPress?.(event, node);
          if (pressed && pressed !== "ignored") return pressed;
          return "render";
        }
        const widgetResult = dispatchWidget(node, event);
        if (widgetResult !== "ignored") return widgetResult;
      }
      return "ignored";
    } finally {
      if (event.kind === "mouse" && event.action === "release") this.pointerCapturedId = undefined;
    }
  }
  render(options: Omit<RenderOptions, "text"> = {}): string { return renderNode(this.root, options); }
}

function isCtrlC(event: SlateEvent): boolean {
  if ((event.modifiers ?? 0) & 2) {
    const code = String(event.code ?? event.text ?? "").toLowerCase();
    return code === "c" || code === "keyc" || code === "ctrl+c";
  }
  return false;
}

export function createApp<S = unknown>(root: SlateNode, initialState?: S): SlateApp<S> { return new SlateApp(root, initialState); }

function createNode(kind: NodeKind, props: NodeProps): SlateNode {
  const id = props.id ?? `slate-${++generatedId}`;
  return { kind, id, props: { ...props, id }, children: normalizeChildren(props.children) };
}

function normalizeChildren(children: NodeProps["children"]): SlateNode[] {
  const values = Array.isArray(children) ? children : children === undefined ? [] : [children];
  return values.flatMap(value => Array.isArray(value) ? normalizeChildren(value) : isReadableSignal(value) ? normalizeChildren(value.get() as NodeProps["children"]) : typeof value === "string" || typeof value === "number" ? [createBlock({ text: String(value) })] : value && typeof value === "object" && "kind" in value ? [value as SlateNode] : []);
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
  const own = node.kind === "button" ? readValue(node.props.label) ?? readValue(node.props.text) ?? "" : readValue(node.props.text) || readValue(node.props.placeholder) || readValue(node.props.label) || "";
  const children = node.children.map(flattenText).filter(Boolean);
  return [own, ...children].filter(Boolean).join("\n");
}

function bounds(node: SlateNode): { x: number; y: number; width: number; height: number } {
  const text = String(node.kind === "button" ? readValue(node.props.label) ?? readValue(node.props.text) ?? "" : readValue(node.props.text) || readValue(node.props.placeholder) || readValue(node.props.label) || "");
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

function focusableIds(node: SlateNode): ElementId[] {
  if (node.props.visible === false) return [];
  return [node.props.focusable && node.props.disabled !== true ? node.id : undefined, ...node.children.flatMap(focusableIds)].filter((id): id is ElementId => id !== undefined);
}

function dispatchWidget(node: SlateNode, event: SlateEvent): EventResult {
  if (node.kind === "input") return dispatchInput(node, event);
  if (node.kind === "checkbox" && ((event.kind === "key" && event.phase !== "release" && (event.code === " " || event.code === "Space" || event.code === "Enter")) || (event.kind === "mouse" && event.action === "press" && (event.button === undefined || event.button === "left")))) {
    const next = !Boolean(readValue(node.props.checked));
    const result = node.props.onChange?.(next, node);
    if (result && result !== "ignored") return result;
    setValue(node, "checked", next);
    return "render";
  }
  if (node.kind === "select" && event.kind === "key" && event.phase !== "release") {
    const options = node.props.options ?? [];
    const direction = event.code === "Up" || event.code === "ArrowUp" || event.code === "Left" || event.code === "ArrowLeft" ? -1 : event.code === "Down" || event.code === "ArrowDown" || event.code === "Right" || event.code === "ArrowRight" ? 1 : 0;
    if (direction === 0 || options.length === 0) return "ignored";
    const current = Math.max(0, Math.min(options.length - 1, Math.trunc(Number(readValue(node.props.selectedIndex)) || 0)));
    const next = findEnabledOption(options, current, direction);
    const result = node.props.onChange?.(next, node);
    if (result && result !== "ignored") return result;
    setValue(node, "selectedIndex", next);
    return "render";
  }
  if (node.kind === "tabs" && event.kind === "key" && event.phase !== "release") {
    const tabs = node.props.tabs ?? [];
    if (tabs.length === 0) return "ignored";
    const direction = event.code === "Left" || event.code === "ArrowLeft" ? -1 : event.code === "Right" || event.code === "ArrowRight" ? 1 : 0;
    if (direction === 0) return "ignored";
    const current = Math.max(0, Math.min(tabs.length - 1, Math.trunc(Number(readValue(node.props.activeIndex)) || 0)));
    const next = (current + direction + tabs.length) % tabs.length;
    const result = node.props.onChange?.(next, node);
    if (result && result !== "ignored") return result;
    setValue(node, "activeIndex", next);
    return "render";
  }
  return "ignored";
}

function dispatchInput(node: SlateNode, event: SlateEvent): EventResult {
  if (event.kind === "key" && event.phase === "release") return "ignored";
  const current = String(readValue(node.props.value ?? node.props.defaultValue ?? ""));
  const code = event.code ?? event.text ?? "";
  if (event.kind === "key" && (code === "Enter" || code === "Return")) {
    const result = node.props.onSubmit?.(current, node);
    return result && result !== "ignored" ? result : "consumed";
  }
  const chars = segmentGraphemes(current);
  let cursor = Math.max(0, Math.min(chars.length, Math.trunc(Number(readValue(node.props.cursor)) || chars.length)));
  const insert = segmentGraphemes(event.text ?? code);
  if (event.kind === "paste" || event.kind === "ime" || (event.kind === "key" && insert.length === 1 && ((event.modifiers ?? 0) & 6) === 0)) {
    chars.splice(cursor, 0, ...insert);
    cursor += insert.length;
    return commitInput(node, chars.join(""), cursor);
  }
  if (event.kind !== "key") return "ignored";
  if (code === "Backspace") {
    if (cursor === 0) return "consumed";
    chars.splice(cursor - 1, 1);
    return commitInput(node, chars.join(""), cursor - 1);
  }
  if (code === "Delete") {
    if (cursor >= chars.length) return "consumed";
    chars.splice(cursor, 1);
    return commitInput(node, chars.join(""), cursor);
  }
  if (code === "Left" || code === "ArrowLeft") return commitInput(node, current, cursor - 1);
  if (code === "Right" || code === "ArrowRight") return commitInput(node, current, cursor + 1);
  if (code === "Home") return commitInput(node, current, 0);
  if (code === "End") return commitInput(node, current, chars.length);
  return "ignored";
}

function commitInput(node: SlateNode, value: string, cursor: number): EventResult {
  const result = node.props.onChange?.(value, node);
  if (result && result !== "ignored") return result;
  if (node.props.value !== undefined && !isWritableSignal(node.props.value)) return "consumed";
  setValue(node, "value", value);
  if (node.props.cursor === undefined || isWritableSignal(node.props.cursor)) setValue(node, "cursor", cursor);
  return "render";
}

function setValue(node: SlateNode, property: "value" | "cursor" | "checked" | "selectedIndex" | "activeIndex", value: string | boolean | number): void {
  const current = node.props[property];
  if (isWritableSignal(current)) current.set(value as never);
  else node.props = { ...node.props, [property]: value };
}

function readValue(value: unknown): unknown {
  return isReadableSignal(value) ? value.get() : value;
}

function isReadableSignal(value: unknown): value is ReadableSignal<unknown> {
  return typeof value === "object" && value !== null && (value as ReadableSignal<unknown>).__slateSignal === true && typeof (value as ReadableSignal<unknown>).get === "function";
}

function isWritableSignal(value: unknown): value is WritableSignal<unknown> {
  return isReadableSignal(value) && typeof (value as WritableSignal<unknown>).set === "function";
}

function findEnabledOption(options: readonly SelectOption[], current: number, direction: number): number {
  for (let step = 1; step <= options.length; step += 1) {
    const index = (current + direction * step + options.length * 2) % options.length;
    if (!options[index]?.disabled) return index;
  }
  return current;
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
  return segmentGraphemes(value).reduce((width, grapheme) => width + graphemeWidth(grapheme), 0);
}

function truncateDisplay(value: string, limit: number): string {
  let width = 0;
  let result = "";
  for (const character of segmentGraphemes(value)) {
    const characterWidth = graphemeWidth(character);
    if (width + characterWidth > limit) break;
    result += character;
    width += characterWidth;
  }
  return result;
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
  const x = options.x ?? 0;
  const y = options.y ?? 0;
  const width = Math.max(1, options.width ?? Math.max(1, ...options.text.split("\n").map(displayWidth)));
  const availableWidth = options.width === undefined ? Number.POSITIVE_INFINITY : Math.max(1, width - x);
  const lines = wrapDisplay(options.text, availableWidth);
  const height = Math.max(1, options.height ?? Math.max(1, lines.length));
  let output = "\x1b[2J\x1b[H\x1b[?25l";
  const foreground = options.foreground && options.foreground !== "default" ? colorSequence(hex(options.foreground), 38) : "\x1b[39m";
  const background = options.background && options.background !== "default" ? colorSequence(hex(options.background), 48) : "\x1b[49m";
  for (let row = 0; row < height; row += 1) {
    const line = lines[row - y] ?? "";
    if (row < y || row - y >= lines.length) continue;
    output += `\x1b[${row + 1};${x + 1}H${foreground}${background}${truncateDisplay(line, Math.max(0, width - x))}`;
  }
  return `${output}\x1b[0m`;
}

function sanitizeTerminalText(value: string): string {
  return value.replace(/\t/g, " ").replace(/\u001B(?:\[[0-?]*[ -\/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/gu, "").replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/gu, "");
}

function wrapDisplay(value: string, maxWidth: number): string[] {
  return value.replace(/\r\n?/g, "\n").split("\n").flatMap(line => {
    if (line.length === 0 || !Number.isFinite(maxWidth)) return [line];
    const result: string[] = [];
    let current = "";
    let width = 0;
    for (const grapheme of segmentGraphemes(line)) {
      const nextWidth = graphemeWidth(grapheme);
      if (current && width + nextWidth > maxWidth) {
        result.push(current);
        current = "";
        width = 0;
      }
      current += grapheme;
      width += nextWidth;
      if (width >= maxWidth) {
        result.push(current);
        current = "";
        width = 0;
      }
    }
    if (current || result.length === 0) result.push(current);
    return result;
  });
}

function segmentGraphemes(value: string): string[] {
  const Segmenter = (Intl as typeof Intl & { Segmenter?: new (locale?: string, options?: { granularity: "grapheme" }) => { segment(input: string): Iterable<{ segment: string }> } }).Segmenter;
  return Segmenter ? [...new Segmenter(undefined, { granularity: "grapheme" }).segment(value)].map(item => item.segment) : [...value];
}

function graphemeWidth(value: string): number {
  const code = value.codePointAt(0) ?? 0;
  if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return 0;
  if (/^(?:\p{Mark}|\uFE0F|\u200D)/u.test(value)) return 0;
  const wide = /\p{Extended_Pictographic}/u.test(value) || [...value].some(character => {
    const point = character.codePointAt(0) ?? 0;
    return point >= 0x1100 && (point <= 0x115f || point === 0x2329 || point === 0x232a || (point >= 0x2e80 && point <= 0xa4cf) || (point >= 0xac00 && point <= 0xd7a3) || (point >= 0xf900 && point <= 0xfaff) || (point >= 0xfe10 && point <= 0xfe19) || (point >= 0xff01 && point <= 0xff60) || point >= 0x1f300);
  });
  return wide ? 2 : 1;
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
