import { isSignal } from "./reactive.js";
import type { ComponentTreeNode, ElementId, HostType, Key, ResolvedProps, SlateChild, SlateComponent, SlateElementType, SlateProps, SlateVNode } from "./types.js";

export const Fragment = Symbol.for("slate.fragment");

const vnodeType = Symbol.for("slate.vnode");

export function createElement<P extends object>(type: SlateElementType<P>, props: P | null, ...children: SlateChild[]): SlateVNode<P> {
  return createVNode(type, props, children, undefined);
}

export function jsx<P extends object>(type: SlateElementType<P>, props: (P & { readonly key?: Key }) | null, key?: Key): SlateVNode<P> {
  return createVNode(type, props, [], key);
}

export const jsxs = jsx;

export function jsxDEV<P extends object>(type: SlateElementType<P>, props: (P & { readonly key?: Key }) | null, key?: Key): SlateVNode<P> {
  return jsx(type, props, key);
}

export function Container(props: SlateProps = {}): SlateVNode {
  return createElement("container", props);
}

export function Block(props: SlateProps = {}): SlateVNode {
  return createElement("block", props);
}

export function Button(props: SlateProps = {}): SlateVNode {
  return createElement<SlateProps>("button", { ...props, focusable: props.focusable ?? true });
}

export function Text(props: SlateProps = {}): SlateVNode {
  return createElement("text", props);
}

export function resolveTree(value: SlateChild): ComponentTreeNode | null {
  const nodes = resolveValue(value, "0", new Set<SlateVNode>());
  if (nodes.length === 0) return null;
  if (nodes.length === 1) {
    const node = nodes[0] ?? null;
    if (node) assertUniqueIds(node, new Set<ElementId>());
    return node;
  }
  const root: ComponentTreeNode = { id: "root", key: null, type: "fragment", props: {}, children: nodes };
  assertUniqueIds(root, new Set<ElementId>());
  return root;
}

function createVNode<P extends object>(type: SlateElementType<P>, props: P | null, children: SlateChild[], explicitKey: Key | undefined): SlateVNode<P> {
  const source = (props ?? {}) as Record<string, unknown>;
  const nextProps = { ...source };
  const propKey = asKey(nextProps.key);
  delete nextProps.key;
  if (children.length > 0) nextProps.children = packChildren(children);
  return { $$typeof: vnodeType, type, key: explicitKey ?? propKey, props: nextProps as P };
}

function packChildren(children: SlateChild[]): SlateChild {
  if (children.length === 1) return children[0] ?? null;
  return children;
}

function resolveValue(value: SlateChild, path: string, stack: Set<SlateVNode>): ComponentTreeNode[] {
  if (value === null || value === undefined || typeof value === "boolean") return [];
  if (isSignal(value)) return resolveValue(value.get() as SlateChild, `${path}.signal`, stack);
  if (typeof value === "string" || typeof value === "number") return [createResolvedNode(`${path}.text`, null, "text", { text: String(value) }, [])];
  if (Array.isArray(value)) return value.flatMap((child, index) => resolveValue(child, `${path}.${index}`, stack));
  if (!isSlateVNode(value)) throw new TypeError("filho Slate inválido");
  if (stack.has(value)) throw new RangeError("árvore Slate cíclica");
  stack.add(value);
  let result: ComponentTreeNode[];
  if (value.type === Fragment) {
    result = resolveValue(readProps(value).children, `${path}.fragment`, stack);
  } else if (typeof value.type === "function") {
    const component = value.type as SlateComponent;
    result = resolveValue(component(value.props), `${path}.component`, stack);
    if (value.key !== null && result.length === 1) {
      const child = result[0];
      if (child && child.key === null) result = [{ ...child, key: value.key }];
    }
  } else if (typeof value.type === "string") {
    const props = readProps(value);
    const children = resolveValue(props.children, `${path}.children`, stack);
    const resolvedProps = normalizeProps(withoutChildren(props));
    const id = asElementId(resolvedProps.id) ?? value.key ?? path;
    result = [createResolvedNode(id, value.key, value.type as HostType, resolvedProps, children)];
  } else {
    throw new TypeError("tipo de elemento Slate inválido");
  }
  stack.delete(value);
  return result;
}

function normalizeProps(props: ResolvedProps): ResolvedProps {
  const result = { ...props } as Record<string, unknown>;
  const style = { ...(isRecord(result.style) ? result.style : {}) } as Record<string, unknown>;
  const aliases: Readonly<Record<string, string>> = {
    direction: "flexDirection",
    wrap: "flexWrap",
    gap: "gap",
    rowGap: "rowGap",
    columnGap: "columnGap",
    flexGrow: "flexGrow",
    flexShrink: "flexShrink",
    flexBasis: "flexBasis",
    width: "width",
    height: "height",
    minWidth: "minWidth",
    maxWidth: "maxWidth",
    minHeight: "minHeight",
    maxHeight: "maxHeight",
    justifyContent: "justifyContent",
    alignItems: "alignItems",
    alignContent: "alignContent",
    alignSelf: "alignSelf",
    padding: "padding",
    paddingTop: "paddingTop",
    paddingRight: "paddingRight",
    paddingBottom: "paddingBottom",
    paddingLeft: "paddingLeft",
    margin: "margin",
    marginTop: "marginTop",
    marginRight: "marginRight",
    marginBottom: "marginBottom",
    marginLeft: "marginLeft",
    position: "position",
    top: "top",
    right: "right",
    bottom: "bottom",
    left: "left",
    overflow: "overflow",
    overflowX: "overflowX",
    overflowY: "overflowY",
    scrollLeft: "scrollLeft",
    scrollTop: "scrollTop"
  };
  for (const [source, target] of Object.entries(aliases)) {
    if (result[source] !== undefined && style[target] === undefined) style[target] = result[source];
  }
  result.style = style;
  return result;
}

function createResolvedNode(id: ElementId, key: Key | null, type: HostType, props: ResolvedProps, children: readonly ComponentTreeNode[]): ComponentTreeNode {
  return { id, key, type, props, children };
}

function readProps(value: SlateVNode): SlateProps {
  return value.props as SlateProps;
}

function withoutChildren(props: SlateProps): ResolvedProps {
  const result = { ...props } as Record<string, unknown>;
  delete result.children;
  delete result.key;
  return result;
}

function isSlateVNode(value: SlateChild): value is SlateVNode {
  return typeof value === "object" && value !== null && !Array.isArray(value) && (value as SlateVNode).$$typeof === vnodeType;
}

function asElementId(value: unknown): ElementId | undefined {
  return typeof value === "string" || typeof value === "number" ? value : undefined;
}

function asKey(value: unknown): Key | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertUniqueIds(node: ComponentTreeNode, ids: Set<ElementId>): void {
  if (ids.has(node.id)) throw new RangeError(`ID Slate duplicado: ${String(node.id)}`);
  ids.add(node.id);
  for (const child of node.children) assertUniqueIds(child, ids);
}
