import type { SlateChild } from "./types.js";
import { Fragment, resolveTree } from "./vnode.js";
import { createSlateHooks, type SlateHookRuntime, type SlateHooks, type SlateStore } from "./state.js";

export interface ReactRuntime extends SlateHookRuntime {
  readonly createElement: (type: unknown, props: Readonly<Record<string, unknown>> | null, ...children: unknown[]) => unknown;
  readonly Fragment?: unknown;
}

export interface ReactAdapterOptions {
  readonly hosts?: Readonly<Record<string, unknown>>;
  readonly fragment?: unknown;
}

export interface ReactAdapter {
  readonly runtime: ReactRuntime;
  readonly hooks: SlateHooks;
  readonly useSlateState: SlateHooks["useSlateState"];
  readonly useSlateStore: <S>(store: SlateStore<S>) => S;
  readonly toReact: (value: SlateChild) => unknown;
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
