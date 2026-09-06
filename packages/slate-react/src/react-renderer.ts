import { createRequire } from "node:module";
import { createSlateApp, type SlateApplication, type SlateAppOptions } from "./runtime.js";
import { createElement, Fragment } from "./vnode.js";
import type { SlateChild, SlateProps, SlateVNode } from "./types.js";

/** React major → the `react-reconciler` line built against it. */
const RECONCILER_LINES: Readonly<Record<number, string>> = { 18: "0.29", 19: "0.31" };

export interface ReactCompatibility {
  /** React major found at runtime, when React is resolvable from here. */
  readonly reactMajor?: number;
  /** React major the installed reconciler was built for. */
  readonly reconcilerMajor?: number;
  /** False only when both majors are known and disagree. */
  readonly supported: boolean;
}

/**
 * Compares an installed React with the React line its `react-reconciler` was
 * built for. npm peer ranges cannot express "React 18 requires 0.29 and React
 * 19 requires 0.31", so the pair is checked here instead of being assumed.
 *
 * `reconcilerReactRange` is the reconciler's own `peerDependencies.react`;
 * `createContainerArity` is the fallback signal when that file cannot be read,
 * because 0.29 takes eight arguments in `createContainer` and 0.31 takes ten.
 * An unknown side never fails the check.
 */
export function checkReactCompatibility(reactVersion: string | undefined, reconcilerReactRange: string | undefined, createContainerArity?: number): ReactCompatibility {
  const reactMajor = majorOf(reactVersion);
  const fromArity = createContainerArity === undefined ? undefined : createContainerArity >= 10 ? 19 : 18;
  const reconcilerMajor = majorOf(reconcilerReactRange) ?? fromArity;
  if (reactMajor === undefined || reconcilerMajor === undefined) return { reactMajor, reconcilerMajor, supported: true };
  return { reactMajor, reconcilerMajor, supported: reactMajor === reconcilerMajor };
}

function majorOf(value: string | undefined): number | undefined {
  const major = Number.parseInt(String(value ?? "").replace(/^[^0-9]*/, ""), 10);
  return Number.isInteger(major) ? major : undefined;
}

export interface ReactTerminalRoot<S = undefined> {
  readonly app: SlateApplication<S>;
  readonly render: (element: unknown) => void;
  readonly unmount: () => void;
  /** Unmounts React and releases Slate's reactive subscriptions. */
  readonly close: () => void;
}

/**
 * Mounts real React elements into Slate's terminal renderer. React owns
 * reconciliation and hooks; Slate owns layout, input, ANSI output and frame
 * deduplication. `react-reconciler` is loaded lazily so non-React consumers
 * keep working without installing React.
 */
export async function createReactTerminalRoot<S = undefined>(options: SlateAppOptions = {}): Promise<ReactTerminalRoot<S>> {
  // The peer has no official type package; the host config is intentionally
  // structural so this remains compatible across React 18/19 reconciler builds.
  let reconcilerModule: unknown;
  try {
    // @ts-ignore react-reconciler may ship no declarations in consumer projects.
    reconcilerModule = await import("react-reconciler");
  } catch (error) {
    throw incompatibleReactError(error);
  }
  const Reconciler = (reconcilerModule as unknown as { default?: (config: unknown) => any }).default ?? reconcilerModule;
  // Checked before the factory runs: a crossed pair usually explodes inside
  // react-reconciler with an opaque error, which would hide the real cause.
  const reactVersion = await installedVersion("react");
  const reactRange = reconcilerReactRange();
  const declared = checkReactCompatibility(reactVersion, reactRange);
  if (!declared.supported) throw mismatchedReactError(declared);
  let rootChildren: SlateChild[] = [];
  let app!: SlateApplication<S>;
  let disposed = false;
  const container = { children: rootChildren };
  const commit = () => {
    rootChildren = container.children;
    if (!disposed) app.render();
  };
  const hostConfig: Record<string, unknown> = {
    supportsMutation: true,
    supportsPersistence: false,
    supportsHydration: false,
    isPrimaryRenderer: false,
    now: () => Date.now(),
    getCurrentEventPriority: () => 1,
    getCurrentUpdatePriority: () => 1,
    setCurrentUpdatePriority: () => undefined,
    resolveUpdatePriority: () => 1,
    trackSchedulerEvent: () => undefined,
    supportsMicrotasks: true,
    scheduleMicrotask: (callback: () => void) => queueMicrotask(callback),
    getRootHostContext: () => ({}),
    getChildHostContext: () => ({}),
    prepareForCommit: () => null,
    resetAfterCommit: commit,
    shouldSetTextContent: () => false,
    createInstance: (type: string, props: Record<string, unknown>) => {
      const { children: _children, ...hostProps } = props;
      return createElement(type as any, { ...hostProps, children: [] } as SlateProps);
    },
    // Text is a real host node so its content can be updated in place; a plain
    // string instance would be immutable and every text change would be lost.
    createTextInstance: (text: string) => createElement("text" as any, { text } as SlateProps),
    appendInitialChild: (parent: SlateVNode, child: SlateChild) => { childList(parent).push(child); },
    appendChild: (parent: SlateVNode, child: SlateChild) => append(parent, child),
    appendChildToContainer: (parent: typeof container, child: SlateChild) => {
      removeFrom(parent.children, child);
      parent.children.push(child);
    },
    insertBefore: (parent: SlateVNode, child: SlateChild, before: SlateChild) => insert(childList(parent), child, before),
    insertInContainerBefore: (parent: typeof container, child: SlateChild, before: SlateChild) => insert(parent.children, child, before),
    removeChild: (parent: SlateVNode, child: SlateChild) => { removeFrom(childList(parent), child); },
    removeChildFromContainer: (parent: typeof container, child: SlateChild) => { removeFrom(parent.children, child); },
    detachDeletedInstance: () => undefined,
    prepareUpdate: () => true,
    // React 19 calls (instance, type, prevProps, nextProps, handle); React 18
    // calls (instance, updatePayload, type, prevProps, nextProps, handle).
    commitUpdate: (instance: SlateVNode, ...rest: unknown[]) => {
      const next = typeof rest[0] === "string" ? rest[2] : rest[3];
      if (isRecord(next)) applyProps(instance, next);
    },
    commitTextUpdate: (instance: SlateVNode, _old: string, next: string) => {
      (instance.props as Record<string, unknown>).text = next;
    },
    clearContainer: (parent: typeof container) => { parent.children.length = 0; },
    finalizeInitialChildren: () => false,
    maySuspendCommit: () => false,
    preloadInstance: () => undefined,
    startSuspendingCommit: () => undefined,
    suspendInstance: () => undefined,
    waitForCommitToBeReady: () => null,
    getPublicInstance: (instance: SlateVNode) => instance,
    preparePortalMount: () => undefined,
    scheduleTimeout: setTimeout,
    cancelTimeout: clearTimeout,
    noTimeout: -1
  };
  app = createSlateApp(() => rootChildren, { ...options, autoMount: false }) as unknown as SlateApplication<S>;
  let reconciler: any;
  try {
    if (typeof Reconciler !== "function") throw new TypeError("react-reconciler did not export a reconciler factory");
    reconciler = (Reconciler as (config: unknown) => any)(hostConfig);
  } catch (error) {
    throw incompatibleReactError(error);
  }
  // Second pass: when the reconciler ships no readable package.json, the
  // arity of createContainer still identifies its line.
  const compatibility = checkReactCompatibility(reactVersion, reactRange, reconciler.createContainer.length);
  if (!compatibility.supported) throw mismatchedReactError(compatibility);
  const onUncaughtError = (error: unknown) => { if (!app.reportError(error)) console.error(error); };
  const onLoggedError = (error: unknown) => { console.error(error); };
  // react-reconciler 0.31 takes three error callbacks; the 0.29 line used by
  // React 18 takes only `onRecoverableError`. Passing a non-function for any of
  // them makes React fail inside its own error path.
  const fiberRoot = reconciler.createContainer.length >= 10
    ? reconciler.createContainer(container, 0, null, false, null, "Slate", onUncaughtError, onLoggedError, onLoggedError, null)
    : reconciler.createContainer(container, 0, null, false, null, "Slate", onLoggedError, null);
  const teardownReact = () => {
    if (disposed) return;
    disposed = true;
    reconciler.updateContainer(null, fiberRoot, null, undefined);
    container.children.length = 0;
    rootChildren = [];
  };
  // Closing the Slate app from anywhere (a terminal controller, Ctrl+C, an
  // input failure) must also unmount React, otherwise component effects,
  // timers and subscriptions outlive the terminal session.
  const detachClose = app.subscribeClose(teardownReact);
  return {
    app,
    render: element => {
      if (disposed) return;
      reconciler.updateContainer(element, fiberRoot, null, undefined);
    },
    unmount: () => {
      teardownReact();
      app.unmount();
    },
    close: () => {
      teardownReact();
      detachClose();
      app.close();
    }
  };
}

function mismatchedReactError(compatibility: ReactCompatibility): Error {
  const { reactMajor, reconcilerMajor } = compatibility;
  const wanted = reactMajor === undefined ? undefined : RECONCILER_LINES[reactMajor];
  return new Error(
    `@slate-terminal/react: React ${reactMajor} está instalado com um react-reconciler da linha ${reconcilerMajor === undefined ? "desconhecida" : RECONCILER_LINES[reconcilerMajor] ?? String(reconcilerMajor)}. `
      + "React 19 usa react-reconciler 0.31; React 18 usa a linha 0.29. "
      + (wanted === undefined
        ? "Nenhuma combinação suportada existe para esta versão de React."
        : `Instale react-reconciler@${wanted} ou ajuste a versão de React.`)
  );
}

/** Reads a peer's version without making it a hard dependency of the bundle. */
async function installedVersion(name: string): Promise<string | undefined> {
  try {
    const module = await import(/* @vite-ignore */ name) as { version?: string; default?: { version?: string } };
    return module.version ?? module.default?.version;
  } catch {
    return undefined;
  }
}

function reconcilerReactRange(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    return (require("react-reconciler/package.json") as { peerDependencies?: Record<string, string> }).peerDependencies?.react;
  } catch {
    return undefined;
  }
}

function incompatibleReactError(cause: unknown): Error {
  return new Error(
    "@slate-terminal/react: createReactTerminalRoot precisa de React e de um react-reconciler compatível. "
      + "React 19 usa react-reconciler 0.31; React 18 deve usar a linha 0.29. "
      + "O createReactAdapter continua disponível para React 18 sem o reconciler de terminal.",
    { cause }
  );
}

/**
 * Applies a host update without touching `children`: those are owned by the
 * reconciler's insert/remove callbacks. Props absent from the next render are
 * deleted so a removed `foreground` really disappears.
 */
function applyProps(instance: SlateVNode, next: Readonly<Record<string, unknown>>): void {
  const target = instance.props as Record<string, unknown>;
  for (const key of Object.keys(target)) {
    if (key === "children") continue;
    if (!(key in next) || next[key] === undefined) delete target[key];
  }
  for (const [key, value] of Object.entries(next)) {
    if (key === "children" || value === undefined) continue;
    target[key] = value;
  }
}

function childList(parent: SlateVNode): SlateChild[] {
  const props = parent.props as Record<string, unknown>;
  const children = props.children;
  if (Array.isArray(children)) return children as SlateChild[];
  props.children = children === undefined || children === null ? [] : [children as SlateChild];
  return props.children as SlateChild[];
}

/** Appending an existing child is a move: drop the stale position first. */
function append(parent: SlateVNode, child: SlateChild): void {
  const children = childList(parent);
  removeFrom(children, child);
  children.push(child);
}

function insert(children: SlateChild[], child: SlateChild, before: SlateChild): void {
  removeFrom(children, child);
  const index = children.indexOf(before);
  children.splice(index < 0 ? children.length : index, 0, child);
}

function removeFrom(children: SlateChild[], child: SlateChild): void {
  const index = children.indexOf(child);
  if (index >= 0) children.splice(index, 1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export { Fragment };
