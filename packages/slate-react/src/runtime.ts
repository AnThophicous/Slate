import { batch, isSignal, signal, track } from "./reactive.js";
import { createFocusManager, collectFocusable, hitTest, pathTo, type FocusManager } from "./focus.js";
import { createFlexLayoutEngine, type LayoutEngine, type LayoutTreeNode, type Viewport } from "./flex.js";
import { createSlateRoot, reconcile, type ReconcileOperation } from "./reconcile.js";
import { renderTreeToAnsi, type TerminalRenderOptions } from "./terminal.js";
import { displayWidth, segmentGraphemes, wrapText } from "./text.js";
import { resolveTree, STYLE_ALIASES } from "./vnode.js";
import type { ComponentTreeNode, ElementId, EventResult, NodeProps, ReadableSignal, SlateChild, SlateEvent } from "./types.js";
import { createNormalizedInput, isEmergencyExit, normalizeEvent } from "./input.js";

export interface SlateAppOptions {
  readonly viewport?: Viewport;
  readonly layout?: LayoutEngine;
  readonly initialFocus?: ElementId;
  readonly autoMount?: boolean;
  readonly frameRate?: number;
  /** Maximum synchronous passes before a feedback loop is surfaced. */
  readonly maxRenderPasses?: number;
}

export interface SlateCommit {
  readonly operations: readonly ReconcileOperation[];
  readonly tree: ComponentTreeNode | null;
  readonly layout: LayoutTreeNode | null;
  readonly viewport: Viewport;
}

export type SlateInputHandler = (event: SlateEvent, app: SlateApplication<unknown>) => EventResult | void;

export interface SlateInputSource {
  readonly poll: (timeoutMs?: number) => SlateEvent | null;
  /** Optional initial terminal size; resize events remain authoritative. */
  readonly size?: () => Viewport;
  /** Releases terminal resources owned by this source, when applicable. */
  readonly close?: () => void;
}

export interface SlateInputRouter {
  readonly start: () => void;
  readonly stop: () => void;
  /** Stops polling, releases the source and closes the attached app. */
  readonly close: () => void;
  readonly running: () => boolean;
  readonly error: () => unknown;
}

export interface SlateOutput {
  readonly write: (value: string) => unknown;
}

/** Creates a frame-aware output sink. Identical frames are never written. */
export function createSlateOutput(target: SlateOutput | { write(chunk: string, ...args: never[]): unknown }): SlateOutput {
  let previous: string | undefined;
  return {
    write(value: string): unknown {
      if (value === previous) return false;
      const result = target.write(value);
      previous = value;
      return result;
    }
  };
}

export interface TerminalControllerOptions {
  readonly intervalMs?: number;
  readonly animationFps?: number;
  readonly render?: TerminalRenderOptions;
  readonly onExit?: () => void;
  readonly onError?: (error: unknown) => void;
}

export interface SlateTerminalController extends SlateInputRouter {
  readonly dispose: () => void;
}

export interface FocusBinding {
  readonly id: ElementId;
  readonly focus: () => boolean;
  readonly blur: () => void;
  readonly isFocused: () => boolean;
}

export interface SlateApplication<S> {
  readonly mount: () => readonly ReconcileOperation[];
  readonly unmount: () => readonly ReconcileOperation[];
  /** Unmounts the Slate tree and clears subscriptions held by the app. */
  readonly close: () => readonly ReconcileOperation[];
  readonly render: () => readonly ReconcileOperation[];
  readonly flush: () => readonly ReconcileOperation[];
  readonly getTree: () => ComponentTreeNode | null;
  readonly getLayout: () => LayoutTreeNode | null;
  readonly getLayoutNode: (id: ElementId) => LayoutTreeNode | undefined;
  readonly getViewport: () => Viewport;
  readonly setViewport: (viewport: Viewport) => void;
  readonly getState: () => S;
  readonly setState: (action: S | ((previous: S) => S)) => void;
  readonly update: (id: ElementId, patch: Partial<NodeProps>) => boolean;
  readonly edit: (id: ElementId, patch: Partial<NodeProps>) => boolean;
  readonly append: (parentId: ElementId, child: SlateChild) => boolean;
  readonly remove: (id: ElementId) => boolean;
  readonly subscribe: (listener: (commit: SlateCommit) => void) => () => void;
  readonly subscribeInput: (listener: SlateInputHandler) => () => void;
  /** Observes failures raised by renders that run outside a caller's stack. */
  readonly subscribeError: (listener: (error: unknown) => void) => () => void;
  /** Observes `close`, so an embedding renderer can tear itself down too. */
  readonly subscribeClose: (listener: () => void) => () => void;
  /** Routes an error to the observers; returns false when nobody handled it. */
  readonly reportError: (error: unknown) => boolean;
  readonly dispatch: (event: SlateEvent) => EventResult;
  readonly focusManager: FocusManager;
  readonly focus: (id: ElementId) => boolean;
  readonly blur: () => void;
  readonly focused: () => ElementId | undefined;
  readonly scroll: (id: ElementId, deltaX: number, deltaY: number) => boolean;
  readonly scrollTo: (id: ElementId, x: number, y: number) => boolean;
  readonly renderAnsi: (options?: TerminalRenderOptions) => string;
  readonly setCursorVisible: (visible: boolean) => void;
  readonly cursorVisible: () => boolean;
}

export function createSlateApp(view: SlateChild | (() => SlateChild), options?: SlateAppOptions): SlateApplication<undefined>;
export function createSlateApp<S>(view: (state: S) => SlateChild, initialState: S, options?: SlateAppOptions): SlateApplication<S>;
export function createSlateApp<S>(view: SlateChild | ((state: S) => SlateChild), initialStateOrOptions?: S | SlateAppOptions, maybeOptions: SlateAppOptions = {}): SlateApplication<S | undefined> {
  const configured = isAppOptions(initialStateOrOptions) ? initialStateOrOptions : maybeOptions;
  const initialState = isAppOptions(initialStateOrOptions) || initialStateOrOptions === undefined ? undefined : initialStateOrOptions;
  const appState = signal(initialState as S | undefined);
  const root = createSlateRoot();
  const focusManager = createFocusManager(configured.initialFocus);
  const listeners = new Set<(commit: SlateCommit) => void>();
  const inputListeners = new Set<SlateInputHandler>();
  const errorListeners = new Set<(error: unknown) => void>();
  const closeListeners = new Set<() => void>();
  const scrollValues = new Map<ElementId, { x: number; y: number }>();
  const uncontrolledValues = new Map<ElementId, WidgetState>();
  const overrides = new Map<ElementId, Readonly<Record<string, unknown>>>();
  const removed = new Set<ElementId>();
  const appended = new Map<ElementId, ComponentTreeNode[]>();
  const layoutEngine = configured.layout ?? createFlexLayoutEngine();
  let viewport = normalizeViewport(configured.viewport ?? { width: 80, height: 24 });
  let hovered: ElementId | undefined;
  let tree: ComponentTreeNode | null = null;
  /** The tree exactly as the view produced it, before imperative edits. */
  let sourceTree: ComponentTreeNode | null = null;
  let sourceIndex: Map<ElementId, ComponentTreeNode> | undefined;
  let layout: LayoutTreeNode | null = null;
  let layoutDirty = true;
  let operations: readonly ReconcileOperation[] = [];
  let dependencies: Array<() => void> = [];
  let presentationDependencies: Array<() => void> = [];
  let scopeDisposers: Array<() => void> = [];
  let mounted = false;
  let rendering = false;
  let rerender = false;
  let queued = false;
  let pendingRender = false;
  let pendingPresentation = false;
  let scheduleToken = 0;
  let scheduledTimer: ReturnType<typeof setTimeout> | undefined;
  let frameIndex = 0;
  let cursorVisible = true;
  const frameRate = normalizeFrameRate(configured.frameRate);
  const maxRenderPasses = normalizeMaxRenderPasses(configured.maxRenderPasses);
  let pointerCapture: ElementId | undefined;

  const queueRender = () => {
    if (!mounted) return;
    pendingRender = true;
    if (rendering) {
      rerender = true;
      return;
    }
    schedule();
  };

  const queuePresentation = () => {
    if (!mounted) return;
    pendingPresentation = true;
    if (!rendering) schedule();
  };

  const renderNow = (): readonly ReconcileOperation[] => {
    if (rendering) {
      rerender = true;
      return operations;
    }
    // Rendering is what makes an app live, whatever asked for it. An embedding
    // renderer such as React drives `render()` directly with `autoMount: false`,
    // and its tree still has to be torn down by `unmount`/`close`.
    mounted = true;
    cancelSchedule();
    rendering = true;
    try {
      let pass = 0;
      do {
        pass += 1;
        if (pass > maxRenderPasses) throw new Error(`Slate detectou um loop de renderização após ${maxRenderPasses} passes; estabilize o estado durante a renderização.`);
        rerender = false;
        pendingRender = false;
        pendingPresentation = false;
        const tracked = track(() => {
          const value = typeof view === "function" ? (view as (state: S | undefined) => SlateChild)(appState.get()) : view;
          root.render(value);
          const source = root.getTree();
          const nextTree = applyEdits(source, overrides, removed, appended);
          const nextOperations = reconcile(tree, nextTree);
          return { operations: nextOperations, tree: nextTree, source };
        });
        const presentation = track(() => {
          if (tracked.value.tree) collectReactiveReads(tracked.value.tree);
        });
        for (const unsubscribe of dependencies) unsubscribe();
        for (const unsubscribe of presentationDependencies) unsubscribe();
        for (const dispose of scopeDisposers) dispose();
        dependencies = tracked.dependencies.map(dependency => dependency.subscribe(queueRender));
        presentationDependencies = presentation.dependencies.map(dependency => dependency.subscribe(queuePresentation));
        scopeDisposers = [tracked.dispose, presentation.dispose];
        operations = tracked.value.operations;
        tree = tracked.value.tree;
        sourceTree = tracked.value.source;
        sourceIndex = undefined;
        present(operations);
      } while (rerender);
    } finally {
      rendering = false;
    }
    if (pendingRender || pendingPresentation) schedule();
    return operations;
  };

  const mount = () => {
    if (mounted) return operations;
    mounted = true;
    return renderNow();
  };

  const unmount = () => {
    if (!mounted) return [];
    mounted = false;
    cancelSchedule();
    for (const unsubscribe of dependencies) unsubscribe();
    for (const unsubscribe of presentationDependencies) unsubscribe();
    for (const dispose of scopeDisposers) dispose();
    dependencies = [];
    presentationDependencies = [];
    scopeDisposers = [];
    root.render(null);
    operations = reconcile(tree, null);
    tree = null;
    sourceTree = null;
    sourceIndex = undefined;
    layout = null;
    layoutDirty = true;
    overrides.clear();
    removed.clear();
    appended.clear();
    uncontrolledValues.clear();
    hovered = undefined;
    pointerCapture = undefined;
    focusManager.setOrder([]);
    const commit: SlateCommit = { operations, tree, layout, viewport };
    for (const listener of [...listeners]) listener(commit);
    return operations;
  };

  const close = () => {
    for (const listener of [...closeListeners]) {
      try { listener(); } catch (error) { reportError(error); }
    }
    const result = unmount();
    listeners.clear();
    inputListeners.clear();
    closeListeners.clear();
    errorListeners.clear();
    return result;
  };

  const reportError = (error: unknown): boolean => {
    if (errorListeners.size === 0) return false;
    for (const listener of [...errorListeners]) {
      try { listener(error); } catch { /* error observers must not mask the original failure */ }
    }
    return true;
  };

  const setState = (action: S | ((previous: S) => S)) => {
    batch(() => appState.set(action as S | ((previous: S | undefined) => S | undefined)));
    if (mounted) queueRender();
  };

  const update = (id: ElementId, patch: Partial<NodeProps>): boolean => {
    if (!tree || !findNode(tree, id)) return false;
    const normalized = normalizePatch(patch);
    // An imperative edit replaces the widget's own state for the properties it
    // actually sets, and leaves every other internal value untouched.
    for (const property of VALUE_PROPERTIES) if (normalized[property] !== undefined) delete uncontrolledValues.get(id)?.[property];
    const next = { ...(overrides.get(id) ?? {}), ...normalized, id } as Record<string, unknown>;
    overrides.set(id, next);
    queueRender();
    return true;
  };

  const append = (parentId: ElementId, child: SlateChild): boolean => {
    if (!tree || !findNode(tree, parentId)) return false;
    const resolved = resolveTree(child);
    if (!resolved) return false;
    const nodes = resolved.type === "fragment" ? resolved.children : [resolved];
    const ids = new Set<ElementId>();
    collectIds(tree, ids);
    for (const existing of appended.values()) for (const node of existing) collectIds(node, ids);
    for (const node of nodes) {
      const nodeIds = new Set<ElementId>();
      collectIds(node, nodeIds);
      if ([...nodeIds].some(id => ids.has(id))) return false;
      for (const id of nodeIds) ids.add(id);
    }
    appended.set(parentId, [...(appended.get(parentId) ?? []), ...nodes]);
    queueRender();
    return true;
  };

  const remove = (id: ElementId): boolean => {
    if (!tree || id === tree.id || !findNode(tree, id)) return false;
    removed.add(id);
    uncontrolledValues.delete(id);
    queueRender();
    return true;
  };

  const setViewport = (next: Viewport) => {
    viewport = normalizeViewport(next);
    layoutDirty = true;
    queueRender();
  };

  const focus = (id: ElementId): boolean => {
    const previous = focusManager.focused();
    if (!focusManager.focus(id)) return false;
    if (previous !== id) emitFocus(previous, id);
    queuePresentation();
    return true;
  };

  const blur = () => {
    const previous = focusManager.focused();
    focusManager.blur();
    if (previous !== undefined) emitFocus(previous, undefined);
    queuePresentation();
  };

  const dispatch = (event: SlateEvent): EventResult => {
    event = normalizeEvent(event);
    if (!mounted) mount();
    if (isEmergencyExit(event)) {
      pointerCapture = undefined;
      return "exit";
    }
    for (const listener of [...inputListeners]) {
      const result = listener(event, app as SlateApplication<unknown>);
      if (isEventResult(result) && result !== "ignored") return finalizeEventResult(result);
    }
    if (event.kind === "resize" && event.width !== undefined && event.height !== undefined) setViewport({ width: event.width, height: event.height });
    if (event.kind === "key" && event.phase !== "release" && event.code === "Tab") {
      const previous = focusManager.focused();
      if (focusManager.handle(event)) {
        const next = focusManager.focused();
        if (next !== previous) emitFocus(previous, next);
        // Focus is painted, so the move must reach the terminal even though the
        // component tree itself did not change.
        queuePresentation();
        return "consumed";
      }
    }
    const pointMouse = event.kind === "mouse" && event.x !== undefined && event.y !== undefined;
    const mouseX = event.x;
    const mouseY = event.y;
    const hitPath = pointMouse && tree && layout && mouseX !== undefined && mouseY !== undefined
      ? hitTest(tree, layout, mouseX, mouseY)
      : [];
    const capturedNode = pointMouse && pointerCapture !== undefined && tree ? findNode(tree, pointerCapture) : undefined;
    if (capturedNode?.props.visible === false || capturedNode?.props.disabled === true) pointerCapture = undefined;
    const capturedPath = pointMouse && pointerCapture !== undefined && tree ? pathTo(tree, pointerCapture) : undefined;
    const eventPath = pointMouse ? capturedPath ?? hitPath : focusedPath();
    const path = pointMouse ? eventPath : eventPath.length > 0 ? eventPath : tree ? [tree] : [];
    if (pointMouse) event = { ...event, target: path[0]?.id };
    if (event.kind === "mouse" && event.action === "move") {
      const nextHovered = hitPath.find(candidate => candidate.props.onHover !== undefined && candidate.props.disabled !== true)?.id;
      if (nextHovered !== hovered) {
        const previousHovered = hovered;
        hovered = nextHovered;
        const previous = previousHovered === undefined || !tree ? undefined : findNode(tree, previousHovered);
        let hoverResult: EventResult = "ignored";
        if (previous) hoverResult = mergeEventResult(hoverResult, invokeCallback(previous.props.onHover, previous, event) ?? "ignored");
        const target = nextHovered === undefined || !tree ? undefined : findNode(tree, nextHovered);
        if (target) hoverResult = mergeEventResult(hoverResult, invokeCallback(target.props.onHover, target, event) ?? "ignored");
        if (hoverResult !== "ignored") return finalizeEventResult(hoverResult);
      }
    }
    if (event.kind === "mouse" && event.action === "press" && event.button === "left") {
      const target = path.find(candidate => candidate.props.focusable === true && candidate.props.disabled !== true);
      if (target?.props.focusable === true) focus(target.id);
    }
    if (event.kind === "mouse" && event.action === "press") {
      const target = path.find(candidate => candidate.props.capturePointer === true)
        ?? path.find(candidate => candidate.props.focusable === true && candidate.props.disabled !== true);
      if (target && target.props.disabled !== true) pointerCapture = target.id;
    }
    try {
      for (const node of path) {
        const result = handleNodeEvent(node, event);
        if (result !== "ignored") return finalizeEventResult(result);
      }
      return "ignored";
    } finally {
      if (event.kind === "mouse" && event.action === "release") pointerCapture = undefined;
    }
  };

  const scroll = (id: ElementId, deltaX: number, deltaY: number): boolean => {
    if (!tree || !findNode(tree, id)) return false;
    const current = scrollValues.get(id) ?? { x: layoutFor(id)?.scrollLeft ?? 0, y: layoutFor(id)?.scrollTop ?? 0 };
    scrollValues.set(id, { x: Math.max(0, current.x + deltaX), y: Math.max(0, current.y + deltaY) });
    layoutDirty = true;
    queueRender();
    return true;
  };

  const scrollTo = (id: ElementId, x: number, y: number): boolean => {
    if (!tree || !findNode(tree, id)) return false;
    scrollValues.set(id, { x: Math.max(0, x), y: Math.max(0, y) });
    layoutDirty = true;
    queueRender();
    return true;
  };

  const app: SlateApplication<S | undefined> = {
    mount,
    unmount,
    close,
    render: renderNow,
    flush: () => {
      cancelSchedule();
      return mounted ? renderNow() : mount();
    },
    getTree: () => tree,
    getLayout: () => layout,
    getLayoutNode: id => findLayout(layout, id),
    getViewport: () => viewport,
    setViewport,
    getState: () => appState.peek(),
    setState: setState as (action: (S | undefined) | ((previous: S | undefined) => S | undefined)) => void,
    update,
    edit: update,
    append,
    remove,
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeInput: listener => {
      inputListeners.add(listener);
      return () => inputListeners.delete(listener);
    },
    subscribeError: listener => {
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    },
    subscribeClose: listener => {
      closeListeners.add(listener);
      return () => closeListeners.delete(listener);
    },
    reportError,
    dispatch,
    focusManager,
    focus,
    blur,
    focused: focusManager.focused,
    scroll,
    scrollTo,
    renderAnsi: options => {
      if (!mounted) mount();
      const cursor = options?.cursor ?? focusedCursor(tree, layout, focusManager.focused());
      return renderTreeToAnsi(tree, layout, viewport, {
        ...options,
        hideCursor: options?.hideCursor ?? (cursor === undefined || !cursorVisible),
        cursor: cursor ? { ...cursor, visible: options?.cursor?.visible ?? cursorVisible } : undefined,
        frameIndex: options?.frameIndex ?? frameIndex++
      });
    },
    setCursorVisible: visible => { cursorVisible = visible; },
    cursorVisible: () => cursorVisible
  };
  if (configured.autoMount !== false) mount();
  return app;

  function focusedPath(): readonly ComponentTreeNode[] {
    const focused = focusManager.focused();
    if (focused === undefined || !tree) return [];
    return pathTo(tree, focused) ?? [];
  }

  function present(nextOperations: readonly ReconcileOperation[]): void {
    // Layout is the expensive half of a frame. A paint-only change - a colour,
    // a text style, a link - keeps the previous boxes instead of measuring the
    // whole tree again.
    if (layoutDirty || layout === null || tree === null || affectsLayout(nextOperations)) {
      const layoutTree = tree ? withScrollValues(tree, scrollValues) : null;
      layout = layoutTree ? layoutEngine.layout(layoutTree, viewport) : null;
      layoutDirty = false;
      if (tree && layout) focusManager.setOrder(collectFocusable(tree, layout).map(target => target.node.id));
      else focusManager.setOrder([]);
    }
    const commit: SlateCommit = { operations: nextOperations, tree, layout, viewport };
    for (const listener of [...listeners]) listener(commit);
  }

  function layoutFor(id: ElementId): LayoutTreeNode | undefined {
    return findLayout(layout, id);
  }

  function emitFocus(previous: ElementId | undefined, next: ElementId | undefined): void {
    if (previous !== undefined && tree) {
      const previousNode = findNode(tree, previous);
      if (previousNode) finalizeEventResult(invokeCallback(previousNode.props.onBlur, previousNode) ?? "ignored");
    }
    if (next !== undefined && tree) {
      const nextNode = findNode(tree, next);
      if (nextNode) finalizeEventResult(invokeCallback(nextNode.props.onFocus, nextNode) ?? "ignored");
    }
  }

  function handleNodeEvent(node: ComponentTreeNode, event: SlateEvent): EventResult {
    // A disabled node is transparent to dispatch: it receives no handlers or
    // default widget behavior, but an enabled ancestor may still handle the
    // same hit-tested event.
    if (node.props.disabled === true) return "ignored";
    // "ignored" means "not mine": the next handler on the same node, and then
    // the widget's own behavior, still get a chance to run.
    const handler = node.props.onEvent;
    if (typeof handler === "function") {
      const result = handler(event, node);
      if (isEventResult(result) && result !== "ignored") return result;
    }
    const specific = event.kind === "key" ? node.props.onKey : event.kind === "mouse" ? node.props.onMouse : event.kind === "paste" ? node.props.onPaste : event.kind === "resize" ? node.props.onResize : event.kind === "ime" ? node.props.onIme : undefined;
    if (typeof specific === "function") {
      const result = specific(event, node);
      if (isEventResult(result) && result !== "ignored") return result;
    }
    const controller = node.props.controller;
    if (isController(controller)) {
      const result = controller.handle(event);
      if (result !== "ignored") return result;
    }
    return handleDefaultWidget(node, event);
  }

  function finalizeEventResult(result: EventResult): EventResult {
    if (result === "render") queueRender();
    return result;
  }

  function schedule(): void {
    if (!mounted || queued) return;
    queued = true;
    const token = ++scheduleToken;
    const run = () => {
      if (token !== scheduleToken) return;
      queued = false;
      scheduledTimer = undefined;
      const shouldRender = pendingRender;
      pendingRender = false;
      pendingPresentation = false;
      if (!mounted) return;
      // This runs on a microtask or a timer, so a throw here has no caller to
      // catch it. Route it to the observers - typically the terminal
      // controller, which still has to restore the terminal modes.
      try {
        if (shouldRender) renderNow();
        else present([]);
      } catch (error) {
        if (!reportError(error)) throw error;
      }
    };
    if (frameRate > 0) scheduledTimer = setTimeout(run, 1000 / frameRate);
    else queueMicrotask(run);
  }

  function cancelSchedule(): void {
    scheduleToken += 1;
    if (scheduledTimer !== undefined) clearTimeout(scheduledTimer);
    scheduledTimer = undefined;
    queued = false;
  }

  function handleDefaultWidget(node: ComponentTreeNode, event: SlateEvent): EventResult {
    if (node.type === "button" && activates(event)) {
      return invokeCallback(node.props.onPress, node, event) ?? "consumed";
    }
    if (node.type === "input") return handleInput(node, event);
    if (node.type === "select") return handleSelect(node, event);
    if (node.type === "checkbox") return handleCheckbox(node, event);
    if (node.type === "tabs") return handleTabs(node, event);
    if (node.type === "list") {
      const result = handleList(node, event);
      if (result !== "ignored") return result;
    }
    if ((node.type === "scrollView" || node.type === "list") && isScrollEvent(event)) return handleScroll(node, event);
    return "ignored";
  }

  function handleInput(node: ComponentTreeNode, event: SlateEvent): EventResult {
    if (event.kind === "key" && event.phase === "release") return "ignored";
    const current = String(readNodeValue(node, "value", node.props.defaultValue ?? ""));
    const code = event.code ?? event.text ?? "";
    if (event.kind === "key" && (code === "Enter" || code === "Return")) return invokeCallback(node.props.onSubmit, node, event, current) ?? "consumed";
    const chars = segmentGraphemes(current);
    let cursor = clampInteger(readNodeValue(node, "cursor", chars.length), chars.length, chars.length);
    const insert = segmentGraphemes(event.text ?? (event.kind === "key" ? code : ""));
    const insertsText = event.kind === "paste" || event.kind === "ime" || (event.kind === "key" && insert.length === 1 && ((event.modifiers ?? 0) & 6) === 0);
    if (insertsText) {
      chars.splice(cursor, 0, ...insert);
      cursor += insert.length;
      return commitInput(node, chars.join(""), cursor);
    }
    if (event.kind !== "key") return "ignored";
    if (code === "Backspace") {
      if (cursor < 1) return "consumed";
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

  /**
   * Commits one editing step. The caret is stored even when the text is
   * unchanged or owned by the application, so moving it keeps working on a
   * controlled input.
   */
  function commitInput(node: ComponentTreeNode, value: string, cursor: number): EventResult {
    const previous = String(readNodeValue(node, "value", node.props.defaultValue ?? ""));
    const nextCursor = Math.max(0, Math.min(segmentGraphemes(value).length, Math.trunc(cursor)));
    let result: EventResult = "render";
    if (value !== previous) {
      const callback = node.props.onChange;
      if (typeof callback === "function") {
        const outcome = callback(value, node);
        result = isEventResult(outcome) ? outcome : "render";
      } else if (isControlled(node, "value")) {
        result = "consumed";
      } else {
        writeNodeValue(node, "value", value);
      }
    }
    if (!isControlled(node, "cursor")) writeNodeValue(node, "cursor", nextCursor);
    return result;
  }

  function handleSelect(node: ComponentTreeNode, event: SlateEvent): EventResult {
    if (event.kind === "key" && event.phase === "release") return "ignored";
    if (event.kind !== "key") return event.kind === "mouse" && event.action === "press" ? "consumed" : "ignored";
    const options = Array.isArray(node.props.options) ? node.props.options : [];
    if (options.length === 0) return "consumed";
    const code = event.code;
    const direction = code === "Up" || code === "ArrowUp" || code === "Left" || code === "ArrowLeft" ? -1 : code === "Down" || code === "ArrowDown" || code === "Right" || code === "ArrowRight" ? 1 : 0;
    if (direction === 0) return "ignored";
    const current = clampInteger(readNodeValue(node, "selectedIndex", 0), options.length - 1, 0);
    const next = findEnabled(options, current, direction);
    if (next === current) return "consumed";
    const callback = node.props.onChange;
    if (typeof callback === "function") {
      const result = callback(next, node);
      return isEventResult(result) ? result : "render";
    }
    if (isControlled(node, "selectedIndex")) return "consumed";
    writeNodeValue(node, "selectedIndex", next);
    return "render";
  }

  function handleCheckbox(node: ComponentTreeNode, event: SlateEvent): EventResult {
    if (event.kind === "key" && event.phase === "release") return "ignored";
    if (!((event.kind === "key" && (event.code === " " || event.code === "Space" || event.code === "Enter")) || (event.kind === "mouse" && event.action === "press" && event.button === "left"))) return "ignored";
    const callback = node.props.onChange;
    const next = !Boolean(readNodeValue(node, "checked", false));
    if (typeof callback === "function") {
      const result = callback(next, node);
      return isEventResult(result) ? result : "render";
    }
    if (isControlled(node, "checked")) return "consumed";
    writeNodeValue(node, "checked", next);
    return "render";
  }

  function handleTabs(node: ComponentTreeNode, event: SlateEvent): EventResult {
    if (event.kind === "key" && event.phase === "release") return "ignored";
    if (event.kind !== "key") return "ignored";
    const tabs = Array.isArray(node.props.tabs) ? node.props.tabs : [];
    if (tabs.length === 0) return "consumed";
    const direction = event.code === "Left" || event.code === "ArrowLeft" ? -1 : event.code === "Right" || event.code === "ArrowRight" ? 1 : 0;
    if (direction === 0) return "ignored";
    const current = clampInteger(readNodeValue(node, "activeIndex", 0), tabs.length - 1, 0);
    const next = (current + direction + tabs.length) % tabs.length;
    const callback = node.props.onChange;
    if (typeof callback === "function") {
      const result = callback(next, node);
      return isEventResult(result) ? result : "render";
    }
    if (isControlled(node, "activeIndex")) return "consumed";
    writeNodeValue(node, "activeIndex", next);
    return "render";
  }

  function handleList(node: ComponentTreeNode, event: SlateEvent): EventResult {
    if (event.kind === "key" && event.phase === "release") return "ignored";
    const items = Array.isArray(node.props.items) ? node.props.items : [];
    if (items.length === 0) return "consumed";
    let next: number | undefined;
    if (event.kind === "key") {
      const current = clampInteger(readNodeValue(node, "activeIndex", 0), items.length - 1, 0);
      if (event.code === "Up" || event.code === "ArrowUp") next = Math.max(0, current - 1);
      else if (event.code === "Down" || event.code === "ArrowDown") next = Math.min(items.length - 1, current + 1);
      else if (event.code === "Home") next = 0;
      else if (event.code === "End") next = items.length - 1;
      else return "ignored";
    } else if (event.kind === "mouse" && event.action === "press" && event.y !== undefined) {
      const target = layoutFor(node.id);
      if (!target) return "ignored";
      next = Math.max(0, Math.min(items.length - 1, Math.trunc(event.y - target.content.y + target.scrollTop)));
    } else return "ignored";
    if (next === undefined) return "ignored";
    const current = clampInteger(readNodeValue(node, "activeIndex", 0), items.length - 1, 0);
    if (next === current) return "consumed";
    const callback = node.props.onChange;
    if (typeof callback === "function") {
      const result = callback(next, node);
      return isEventResult(result) ? result : "render";
    }
    if (isControlled(node, "activeIndex")) return "consumed";
    writeNodeValue(node, "activeIndex", next);
    return "render";
  }

  function handleScroll(node: ComponentTreeNode, event: SlateEvent): EventResult {
    let deltaX = event.deltaX ?? 0;
    let deltaY = event.deltaY ?? 0;
    if (event.kind === "key") {
      if (event.code === "Up" || event.code === "ArrowUp") deltaY = -1;
      else if (event.code === "Down" || event.code === "ArrowDown") deltaY = 1;
      else if (event.code === "PageUp") deltaY = -Math.max(1, layoutFor(node.id)?.layout.height ?? 1);
      else if (event.code === "PageDown") deltaY = Math.max(1, layoutFor(node.id)?.layout.height ?? 1);
      else return "ignored";
    }
    if (deltaX === 0 && deltaY === 0) return "consumed";
    const current = scrollValues.get(node.id) ?? { x: layoutFor(node.id)?.scrollLeft ?? 0, y: layoutFor(node.id)?.scrollTop ?? 0 };
    const next = { x: Math.max(0, current.x + deltaX), y: Math.max(0, current.y + deltaY) };
    scrollValues.set(node.id, next);
    layoutDirty = true;
    const callback = node.props.onScroll;
    if (typeof callback === "function") {
      const result = callback(next.x, next.y, node);
      if (isEventResult(result)) {
        queueRender();
        return result;
      }
    }
    queueRender();
    return "render";
  }

  /** Every widget state property gets its own slot; `value` never aliases `cursor`. */
  function readNodeValue(node: ComponentTreeNode, property: ValueProperty, fallback: unknown): unknown {
    const state = uncontrolledValues.get(node.id);
    if (state && state[property] !== undefined) return state[property];
    return readValue(node.props[property] ?? fallback);
  }

  function writeNodeValue(node: ComponentTreeNode, property: ValueProperty, value: string | number | boolean): void {
    if (setReactiveValue(sourceNode(node.id)?.props[property] ?? node.props[property], value)) return;
    const state = uncontrolledValues.get(node.id) ?? {};
    state[property] = value;
    uncontrolledValues.set(node.id, state);
    overrides.set(node.id, { ...(overrides.get(node.id) ?? {}), [property]: value, id: node.id });
  }

  /**
   * A property is controlled only when the view itself supplies a plain value
   * for it. Internal state is written back into the rendered tree, so asking
   * the rendered node would report every uncontrolled widget as controlled
   * right after its first edit.
   */
  function isControlled(node: ComponentTreeNode, property: ValueProperty): boolean {
    const declared = sourceNode(node.id)?.props[property];
    return declared !== undefined && !isWritable(declared);
  }

  function sourceNode(id: ElementId): ComponentTreeNode | undefined {
    if (!sourceIndex) {
      sourceIndex = new Map();
      if (sourceTree) indexNodes(sourceTree, sourceIndex);
    }
    return sourceIndex.get(id);
  }
}

const VALUE_PROPERTIES = ["value", "selectedIndex", "checked", "activeIndex", "cursor"] as const;
type ValueProperty = typeof VALUE_PROPERTIES[number];
/** Widget state kept by Slate, one slot per element and per property. */
type WidgetState = Partial<Record<ValueProperty, string | number | boolean>>;

function indexNodes(node: ComponentTreeNode, index: Map<ElementId, ComponentTreeNode>): void {
  if (!index.has(node.id)) index.set(node.id, node);
  for (const child of node.children) indexNodes(child, index);
}

/** Props that only change how a node is painted, never where it is placed. */
const PAINT_ONLY_PROPS: ReadonlySet<string> = new Set(["foreground", "background", "borderColor", "textStyle", "link", "effect", "cursor"]);

function affectsLayout(operations: readonly ReconcileOperation[]): boolean {
  // No operations means the difference is not in the tree: a signal read only
  // during presentation can still change the measured text, so measure again.
  if (operations.length === 0) return true;
  return operations.some(operation => operation.type !== "update" || Object.keys(operation.changes).some(key => !PAINT_ONLY_PROPS.has(key)));
}

export function render(view: SlateChild | (() => SlateChild), options?: SlateAppOptions): SlateApplication<undefined>;
export function render<S>(view: (state: S) => SlateChild, initialState: S, options?: SlateAppOptions): SlateApplication<S>;
export function render<S>(view: SlateChild | ((state: S) => SlateChild), initialStateOrOptions?: S | SlateAppOptions, maybeOptions?: SlateAppOptions): SlateApplication<S | undefined> {
  if (isAppOptions(initialStateOrOptions)) return createSlateApp(view as SlateChild | (() => SlateChild), initialStateOrOptions) as SlateApplication<S | undefined>;
  if (initialStateOrOptions !== undefined) return createSlateApp(view as (state: S) => SlateChild, initialStateOrOptions as S, maybeOptions) as SlateApplication<S | undefined>;
  return createSlateApp(view as SlateChild | (() => SlateChild), maybeOptions) as SlateApplication<S | undefined>;
}

export const createApp = render;

export function createInputRouter<S>(app: SlateApplication<S>, source: SlateInputSource, intervalMs = 16, onExit?: () => void, onError?: (error: unknown) => void): SlateInputRouter {
  let normalizedSource = createNormalizedInput(source);
  let active = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let sourceReleased = false;
  let lastError: unknown;
  const waitMs = normalizeInterval(intervalMs);
  const reportError = (error: unknown) => {
    if (lastError === undefined) lastError = error;
    try { onError?.(error); } catch { /* error observers must not break cleanup */ }
  };
  const releaseSource = () => {
    if (sourceReleased) return;
    sourceReleased = true;
    source.close?.();
  };
  const close = () => {
    if (closed) return;
    closed = true;
    if (timer !== undefined) clearTimeout(timer);
    active = false;
    timer = undefined;
    try {
      releaseSource();
    } catch (error) {
      reportError(error);
    } finally {
      try { app.close(); } catch (error) { reportError(error); }
    }
  };
  const fail = (error: unknown) => {
    if (closed) return;
    active = false;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    reportError(error);
    close();
  };
  const tick = () => {
    if (!active) return;
    try {
      const event = normalizedSource.poll(waitMs);
      if (event && app.dispatch(event) === "exit") {
        active = false;
        timer = undefined;
        close();
        try { onExit?.(); } catch (error) { reportError(error); }
        return;
      }
    } catch (error) {
      fail(error);
      return;
    }
    if (!active) return;
    timer = setTimeout(tick, waitMs);
  };
  return {
    start: () => {
      if (active || closed) return;
      sourceReleased = false;
      active = true;
      tick();
    },
    stop: () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      normalizedSource = createNormalizedInput(source);
    },
    close: () => {
      close();
    },
    running: () => active,
    error: () => lastError
  };
}

export function createTerminalController<S>(app: SlateApplication<S>, source: SlateInputSource, output: SlateOutput, options: TerminalControllerOptions = {}): SlateTerminalController {
  let router: SlateInputRouter;
  let unsubscribe: (() => void) | undefined;
  let animationTimer: ReturnType<typeof setTimeout> | undefined;
  let lastFrame: string | undefined;
  let firstFrame = true;
  let signalHandler: (() => void) | undefined;
  let unsubscribeError: (() => void) | undefined;
  let closed = false;
  let handlingError = false;
  let controllerError: unknown;
  const animationFps = normalizeAnimationFps(options.animationFps);
  const reportError = (error: unknown) => {
    if (controllerError === undefined) controllerError = error;
    if (handlingError) return;
    handlingError = true;
    try { options.onError?.(error); } catch { /* error observers must not break terminal recovery */ }
    try { close(); } catch { /* cleanup is best effort at an error boundary */ }
    handlingError = false;
  };
  const emit = (value: string) => {
    try { output.write(value); } catch (error) { reportError(error); }
  };
  const write = () => {
    // A React root can be created before its first reconciler commit. Do not
    // turn that transient (or intentionally unmounted) tree into a blank frame
    // or remount it from inside the commit subscription.
    if (app.getTree() === null) return;
    try {
      const renderOptions = options.render ?? {};
      const frame = app.renderAnsi({ ...renderOptions, clear: renderOptions.clear ?? firstFrame });
      firstFrame = false;
      if (frame === lastFrame) return;
      lastFrame = frame;
      emit(frame);
    } catch (error) {
      reportError(error);
    }
  };
  const stop = () => {
    const wasActive = router.running() || unsubscribe !== undefined;
    router.stop();
    unsubscribe?.();
    unsubscribe = undefined;
    unsubscribeError?.();
    unsubscribeError = undefined;
    if (animationTimer !== undefined) clearTimeout(animationTimer);
    animationTimer = undefined;
    removeSignalHandler();
    lastFrame = undefined;
    firstFrame = true;
    if (wasActive) emit("\u001b[0m\u001b[?25h");
  };
  const close = () => {
    if (closed) return;
    closed = true;
    stop();
    router.close();
    app.close();
  };
  router = createInputRouter(app, source, options.intervalMs ?? 16, () => {
    close();
    try { options.onExit?.(); } catch (error) { reportError(error); }
  }, reportError);
  return {
    start: () => {
      if (closed || router.running()) return;
      try {
        const size = source.size?.();
        if (size && Number.isFinite(size.width) && Number.isFinite(size.height)) app.setViewport(size);
        // A render scheduled on a microtask or a timer has no caller to catch
        // its failure; without this the terminal would stay in raw mode.
        unsubscribeError = app.subscribeError(reportError);
        unsubscribe = app.subscribe(() => {
          write();
          // Animated content can appear at any commit: a spinner that starts
          // spinning must start its own frame loop then, not only at start().
          scheduleAnimation();
        });
        write();
        if (closed) return;
        installSignalHandler();
        router.start();
        scheduleAnimation();
      } catch (error) {
        reportError(error);
      }
    },
    stop,
    close,
    dispose: close,
    running: router.running,
    error: () => controllerError ?? router.error()
  };

  function installSignalHandler(): void {
    if (signalHandler) return;
    const processLike = nodeProcess();
    if (!processLike?.on) return;
    signalHandler = () => {
      try { close(); } finally {
        try { options.onExit?.(); } catch (error) { reportError(error); }
      }
    };
    processLike.on("SIGINT", signalHandler);
  }

  function removeSignalHandler(): void {
    if (!signalHandler) return;
    nodeProcess()?.removeListener?.("SIGINT", signalHandler);
    signalHandler = undefined;
  }

  function scheduleAnimation(): void {
    if (animationTimer !== undefined || closed) return;
    if (animationFps <= 0 || !router.running() || !hasAnimatedContent(app.getTree())) return;
    animationTimer = setTimeout(() => {
      animationTimer = undefined;
      if (!router.running()) return;
      write();
      scheduleAnimation();
    }, 1000 / animationFps);
  }
}

export function useInput<S>(app: SlateApplication<S>, handler: SlateInputHandler): () => void {
  return app.subscribeInput(handler);
}

export function useFocus<S>(app: SlateApplication<S>, id: ElementId): FocusBinding {
  return { id, focus: () => app.focus(id), blur: app.blur, isFocused: () => app.focused() === id };
}

export function useFocusManager<S>(app: SlateApplication<S>): FocusManager {
  return app.focusManager;
}

export function useCursor<S>(app: SlateApplication<S>, visible = true): { readonly show: () => void; readonly hide: () => void; readonly isVisible: () => boolean } {
  app.setCursorVisible(visible);
  return { show: () => app.setCursorVisible(true), hide: () => app.setCursorVisible(false), isVisible: app.cursorVisible };
}

export function useWindowSize<S>(app: SlateApplication<S>): Viewport {
  return app.getViewport();
}

function isAppOptions(value: unknown): value is SlateAppOptions {
  if (!isRecord(value)) return false;
  return "viewport" in value || "layout" in value || "initialFocus" in value || "autoMount" in value || "frameRate" in value || "maxRenderPasses" in value;
}

function normalizeViewport(value: Viewport): Viewport {
  return { width: Math.max(0, Math.floor(Number(value.width) || 0)), height: Math.max(0, Math.floor(Number(value.height) || 0)) };
}

function normalizeFrameRate(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isFinite(value) || value < 0) throw new RangeError("frameRate must be a finite non-negative number");
  return value;
}

function normalizeInterval(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError("intervalMs must be a finite non-negative number");
  return Math.min(60_000, Math.trunc(value));
}

function normalizeMaxRenderPasses(value: number | undefined): number {
  if (value === undefined) return 100;
  if (!Number.isFinite(value) || value < 1) throw new RangeError("maxRenderPasses must be a finite positive number");
  return Math.min(10_000, Math.trunc(value));
}

interface SignalProcess {
  readonly on?: (event: string, listener: () => void) => unknown;
  readonly removeListener?: (event: string, listener: () => void) => unknown;
}

function nodeProcess(): SignalProcess | undefined {
  const candidate = (globalThis as typeof globalThis & { process?: unknown }).process;
  return isRecord(candidate) ? candidate as SignalProcess : undefined;
}

function normalizeAnimationFps(value: number | undefined): number {
  if (value === undefined) return 60;
  if (!Number.isFinite(value) || value < 0) throw new RangeError("animationFps must be a finite non-negative number");
  return Math.min(240, value);
}

function hasAnimatedContent(node: ComponentTreeNode | null): boolean {
  if (!node) return false;
  const effect = readValue(node.props.effect);
  if (isRecord(effect) && (effect.kind === "glow" || effect.kind === "colorShift")) return true;
  if (node.type === "spinner" && readValue(node.props.spinning ?? true) !== false) return true;
  if ((node.type === "video" || node.type === "media") && Array.isArray(node.props.frames) && node.props.frames.length > 1) return true;
  return node.children.some(hasAnimatedContent);
}

function collectReactiveReads(value: unknown, seen = new Set<object>()): void {
  if (isSignal(value)) {
    value.get();
    return;
  }
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectReactiveReads(item, seen);
    return;
  }
  for (const item of Object.values(value)) collectReactiveReads(item, seen);
}

function withScrollValues(node: ComponentTreeNode, values: ReadonlyMap<ElementId, { x: number; y: number }>): ComponentTreeNode {
  const own = values.get(node.id);
  const children = node.children.map(child => withScrollValues(child, values));
  if (!own) return children.every((child, index) => child === node.children[index]) ? node : { ...node, children };
  const style = isRecord(node.props.style) ? node.props.style : {};
  return { ...node, props: { ...node.props, style: { ...style, scrollLeft: own.x, scrollTop: own.y } }, children };
}

function applyEdits(node: ComponentTreeNode | null, overrides: ReadonlyMap<ElementId, Readonly<Record<string, unknown>>>, removed: ReadonlySet<ElementId>, appended: ReadonlyMap<ElementId, readonly ComponentTreeNode[]>): ComponentTreeNode | null {
  if (!node || removed.has(node.id)) return null;
  const children = [...node.children.map(child => applyEdits(child, overrides, removed, appended)).filter((child): child is ComponentTreeNode => child !== null), ...(appended.get(node.id) ?? []).map(child => applyEdits(child, overrides, removed, appended)).filter((child): child is ComponentTreeNode => child !== null)].filter(child => !removed.has(child.id));
  const props = overrides.get(node.id);
  if (!props && children.every((child, index) => child === node.children[index]) && children.length === node.children.length) return node;
  return { ...node, props: props ? { ...node.props, ...props, id: node.id } : node.props, children };
}

function collectIds(node: ComponentTreeNode, ids: Set<ElementId>): void {
  ids.add(node.id);
  for (const child of node.children) collectIds(child, ids);
}

function normalizePatch(patch: Partial<NodeProps>): Readonly<Record<string, unknown>> {
  const result = { ...patch } as Record<string, unknown>;
  delete result.children;
  const style = { ...(isRecord(result.style) ? result.style : {}) } as Record<string, unknown>;
  let styleChanged = isRecord(result.style);
  for (const [source, target] of STYLE_ALIASES) {
    if (result[source] !== undefined) {
      style[target] = result[source];
      styleChanged = true;
    }
  }
  if (styleChanged) result.style = style;
  else delete result.style;
  return result;
}

function findLayout(layout: LayoutTreeNode | null, id: ElementId): LayoutTreeNode | undefined {
  if (!layout) return undefined;
  if (layout.id === id) return layout;
  for (const child of layout.children) {
    const found = findLayout(child, id);
    if (found) return found;
  }
  return undefined;
}

function findNode(node: ComponentTreeNode, id: ElementId): ComponentTreeNode | undefined {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}

function focusedCursor(tree: ComponentTreeNode | null, layout: LayoutTreeNode | null, id: ElementId | undefined): { readonly x: number; readonly y: number } | undefined {
  if (id === undefined || !tree || !layout) return undefined;
  const node = findNode(tree, id);
  const target = findLayout(layout, id);
  if (!node || !target || node.type !== "input") return undefined;
  const value = String(readValue(node.props.value ?? node.props.defaultValue ?? ""));
  const controller = isRecord(node.props.controller) ? node.props.controller : undefined;
  const graphemes = segmentGraphemes(value);
  const cursor = clampInteger(node.props.cursor ?? controller?.cursor, graphemes.length, graphemes.length);
  const prefix = graphemes.slice(0, cursor).join("");
  const lines = wrapText(prefix, target.content.width);
  const line = lines.at(-1) ?? "";
  return { x: target.content.x + displayWidth(line), y: target.content.y + lines.length - 1 };
}

function invokeCallback(value: unknown, node: ComponentTreeNode, event?: SlateEvent, inputValue?: string): EventResult | undefined {
  if (typeof value !== "function") return undefined;
  const result = inputValue === undefined ? event === undefined ? value(node) : value(event, node) : value(inputValue, node);
  return isEventResult(result) ? result : undefined;
}

function isEventResult(value: unknown): value is EventResult {
  return value === "ignored" || value === "consumed" || value === "render" || value === "exit";
}

function mergeEventResult(current: EventResult, next: EventResult): EventResult {
  if (current === "exit" || next === "exit") return "exit";
  if (current === "render" || next === "render") return "render";
  if (current === "consumed" || next === "consumed") return "consumed";
  return "ignored";
}

function isController(value: unknown): value is { readonly handle: (event: SlateEvent) => EventResult } {
  return isRecord(value) && typeof value.handle === "function";
}

function readValue(value: unknown): unknown {
  return isSignal(value) ? (value as ReadableSignal<unknown>).get() : value;
}

function setReactiveValue(value: unknown, next: string | number | boolean): boolean {
  if (!isSignal(value) || typeof (value as { readonly set?: unknown }).set !== "function") return false;
  (value as unknown as { readonly set: (value: string | number | boolean) => void }).set(next);
  return true;
}

function isWritable(value: unknown): boolean {
  return isSignal(value) && typeof (value as { readonly set?: unknown }).set === "function";
}

function clampInteger(value: unknown, max: number, fallback: number): number {
  const number = Number(readValue(value));
  const candidate = Number.isFinite(number) ? Math.trunc(number) : fallback;
  return Math.max(0, Math.min(max, candidate));
}

function activates(event: SlateEvent): boolean {
  return event.kind === "mouse" ? event.action === "press" && (event.button === undefined || event.button === "left") : event.kind === "key" && event.phase !== "release" && (event.code === "Enter" || event.code === "Return" || event.code === " " || event.code === "Space");
}

function isScrollEvent(event: SlateEvent): boolean {
  return event.kind === "mouse" ? event.action === "scroll" : event.kind === "key";
}

function findEnabled(options: readonly { readonly disabled?: boolean }[], current: number, direction: number): number {
  for (let step = 1; step <= options.length; step += 1) {
    const index = (current + direction * step + options.length * 2) % options.length;
    if (!options[index]?.disabled) return index;
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
