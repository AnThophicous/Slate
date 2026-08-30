import { createSlateApp, type SlateApplication, type SlateAppOptions } from "./runtime.js";
import { createElement, Fragment } from "./vnode.js";
import type { SlateChild, SlateProps, SlateVNode } from "./types.js";

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
  let rootChildren: SlateChild[] = [];
  let app!: SlateApplication<S>;
  const container = { children: rootChildren };
  const commit = () => {
    rootChildren = container.children;
    app.render();
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
      return createElement(type as any, hostProps as SlateProps);
    },
    createTextInstance: (text: string) => text,
    appendInitialChild: (parent: SlateVNode, child: SlateChild) => append(parent, child),
    appendChild: (parent: SlateVNode, child: SlateChild) => append(parent, child),
    appendChildToContainer: (parent: typeof container, child: SlateChild) => parent.children.push(child),
    insertBefore: (parent: SlateVNode, child: SlateChild, before: SlateChild) => insert(parent, child, before),
    insertInContainerBefore: (parent: typeof container, child: SlateChild, before: SlateChild) => {
      const index = parent.children.indexOf(before);
      parent.children.splice(index < 0 ? parent.children.length : index, 0, child);
    },
    removeChild: (parent: SlateVNode, child: SlateChild) => remove(parent, child),
    removeChildFromContainer: (parent: typeof container, child: SlateChild) => removeFrom(parent.children, child),
    detachDeletedInstance: () => undefined,
    prepareUpdate: () => true,
    commitUpdate: (instance: SlateVNode, _type: string, _old: unknown, next: Record<string, unknown>) => Object.assign(instance.props, next),
    commitTextUpdate: (_instance: string, _old: string, _next: string) => undefined,
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
  const fiberRoot = reconciler.createContainer(container, 0, null, false, null, "Slate", console.error, null);
  const unmount = () => {
    reconciler.updateContainer(null, fiberRoot, null, undefined);
    app.unmount();
  };
  return {
    app,
    render: element => reconciler.updateContainer(element, fiberRoot, null, undefined),
    unmount,
    close: unmount
  };
}

function incompatibleReactError(cause: unknown): Error {
  return new Error(
    "@slate-terminal/react: createReactTerminalRoot precisa de React e de um react-reconciler compatível. "
      + "React 19 usa react-reconciler 0.31; React 18 deve usar a linha 0.29. "
      + "O createReactAdapter continua disponível para React 18 sem o reconciler de terminal.",
    { cause }
  );
}

function append(parent: SlateVNode, child: SlateChild): void {
  const props = parent.props as SlateProps & { children?: SlateChild };
  props.children = props.children === undefined ? child : Array.isArray(props.children) ? [...props.children, child] : [props.children, child];
}
function insert(parent: SlateVNode, child: SlateChild, before: SlateChild): void {
  const children = childArray(parent.props.children);
  const index = children.indexOf(before);
  children.splice(index < 0 ? children.length : index, 0, child);
  (parent.props as unknown as { children?: SlateChild }).children = children;
}
function remove(parent: SlateVNode, child: SlateChild): void { removeFrom(childArray(parent.props.children), child); }
function removeFrom(children: SlateChild[], child: SlateChild): void { const index = children.indexOf(child); if (index >= 0) children.splice(index, 1); }
function childArray(value: SlateChild | undefined): SlateChild[] { return value === undefined ? [] : Array.isArray(value) ? value as SlateChild[] : [value]; }

export { Fragment };
