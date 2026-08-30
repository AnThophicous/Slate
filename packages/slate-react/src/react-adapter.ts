import type { SlateChild } from "./types.js";
import { Fragment, createElement, resolveTree } from "./vnode.js";
import { createSlateHooks, type SlateHookRuntime, type SlateHooks, type SlateStore } from "./state.js";
import type { NodeProps, SlateComponent } from "./types.js";

export interface ReactRuntime extends SlateHookRuntime {
  readonly createElement: (type: unknown, props: Readonly<Record<string, unknown>> | null, ...children: unknown[]) => unknown;
  readonly Fragment?: unknown;
}

export interface ReactAdapterOptions {
  readonly hosts?: Readonly<Record<string, unknown>>;
  readonly fragment?: unknown;
}

export interface LegacyRendererAdapterOptions {
  /** Host used when the legacy renderer returns text; defaults to `block`. */
  readonly type?: "block" | "text" | "container";
  readonly defaults?: Partial<NodeProps>;
  /** Maps legacy props to Slate props before the host is created. */
  readonly mapProps?: (props: NodeProps) => Partial<NodeProps>;
  /** Return the legacy result directly when it already is a Slate tree. */
  readonly wrap?: boolean;
}

export type LegacyRenderer = (props: NodeProps) => SlateChild;

/**
 * Adapts a renderer written for the pre-Mosaic component contract. The old
 * renderer keeps owning content generation; Slate adds IDs, layout and event
 * props around its result.
 */
export function adaptLegacyRenderer(renderer: LegacyRenderer | { readonly render: LegacyRenderer }, options: LegacyRendererAdapterOptions = {}): SlateComponent<NodeProps> {
  const renderLegacy = typeof renderer === "function" ? renderer : renderer.render;
  return props => {
    const mapped = options.mapProps?.(props) ?? {};
    const content = renderLegacy(props);
    if (options.wrap === false) return content;
    return createElement<NodeProps>(options.type ?? "block", {
      ...options.defaults,
      ...props,
      ...mapped,
      children: content
    });
  };
}

/** Descriptive alias for migrations that call their old component a renderer. */
export function createLegacyRendererAdapter(renderer: LegacyRenderer | { readonly render: LegacyRenderer }, options: LegacyRendererAdapterOptions = {}): SlateComponent<NodeProps> {
  return adaptLegacyRenderer(renderer, options);
}

export interface ReactAdapter {
  readonly runtime: ReactRuntime;
  readonly hooks: SlateHooks;
  readonly useSlateState: SlateHooks["useSlateState"];
  readonly useSlateStore: <S>(store: SlateStore<S>) => S;
  readonly toReact: (value: SlateChild) => unknown;
}

/**
 * Creates the native React-facing surface without importing React at module
 * load time. Pass the React namespace from the application. This keeps Slate
 * usable with React 18 and 19, while the terminal runtime remains independent.
 */
export interface SlateReactRenderer extends ReactAdapter {
  readonly createElement: ReactRuntime["createElement"];
  readonly Fragment: unknown;
  readonly createSlateElement: (type: unknown, props?: Readonly<Record<string, unknown>> | null, ...children: unknown[]) => unknown;
}

export function createSlateReactRenderer(react: ReactRuntime): SlateReactRenderer {
  const adapter = createReactAdapter(react);
  const Fragment = react.Fragment ?? Symbol.for("react.fragment");
  return {
    ...adapter,
    createElement: react.createElement,
    Fragment,
    createSlateElement: (type, props, ...children) => react.createElement(type, props ?? null, ...children)
  };
}

export function createReactAdapter(runtime: ReactRuntime, options: ReactAdapterOptions = {}): ReactAdapter {
  const hooks = createSlateHooks(runtime);
  const toReact = (value: SlateChild): unknown => {
    const tree = resolveTree(value);
    return tree ? toReactNode(tree, runtime, options) : null;
  };
  return { runtime, hooks, useSlateState: hooks.useSlateState, useSlateStore: hooks.useSlateStore, toReact };
}

function toReactNode(node: ReturnType<typeof resolveTree> & {}, runtime: ReactRuntime, options: ReactAdapterOptions): unknown {
  if (node.type === "text" && options.hosts?.text === undefined) return typeof node.props.text === "string" ? node.props.text : "";
  const children = node.children.map(child => toReactNode(child, runtime, options));
  if (node.type === "fragment") {
    const fragment = options.fragment ?? runtime.Fragment;
    return fragment === undefined ? children : runtime.createElement(fragment, null, ...children);
  }
  const type = options.hosts?.[node.type] ?? node.type;
  const props: Record<string, unknown> = { ...node.props };
  if (node.key !== null) props.key = node.key;
  return runtime.createElement(type, props, ...children);
}
