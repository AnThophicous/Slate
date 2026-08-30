import { isSignal, readReactive } from "./reactive.js";
import type { ComponentTreeNode, ElementId, SlateEvent } from "./types.js";
import type { LayoutTreeNode } from "./flex.js";

export interface FocusManager {
  readonly focused: () => ElementId | undefined;
  readonly focus: (id: ElementId) => boolean;
  readonly blur: () => void;
  readonly next: () => ElementId | undefined;
  readonly previous: () => ElementId | undefined;
  readonly handle: (event: SlateEvent) => boolean;
  readonly setOrder: (order: readonly ElementId[]) => void;
}

export function createFocusManager(initial?: ElementId): FocusManager {
  let current = initial;
  let order: readonly ElementId[] = [];
  const focus = (id: ElementId) => {
    if (!order.includes(id)) return false;
    current = id;
    return true;
  };
  const move = (step: 1 | -1) => {
    if (order.length === 0) return undefined;
    const index = current === undefined ? (step > 0 ? -1 : 0) : order.indexOf(current);
    const next = order[(index + step + order.length) % order.length];
    if (next !== undefined) current = next;
    return current;
  };
  return {
    focused: () => current,
    focus,
    blur: () => { current = undefined; },
    next: () => move(1),
    previous: () => move(-1),
    handle: event => {
      if (event.kind !== "key" || event.code !== "Tab") return false;
      if ((event.modifiers ?? 0) & 1) move(-1);
      else move(1);
      return true;
    },
    setOrder: nextOrder => {
      order = nextOrder;
      if (current !== undefined && !order.includes(current)) current = undefined;
    }
  };
}

export interface FocusTarget {
  readonly node: ComponentTreeNode;
  readonly layout: LayoutTreeNode;
}

export function collectFocusable(tree: ComponentTreeNode, layout: LayoutTreeNode): readonly FocusTarget[] {
  const result: FocusTarget[] = [];
  collect(tree, layout, result);
  return result;
}

export function hitTest(tree: ComponentTreeNode, layout: LayoutTreeNode, x: number, y: number): readonly ComponentTreeNode[] {
  if (!contains(layout, x, y) || !renderedNode(tree)) return [];
  for (let index = layout.children.length - 1; index >= 0; index -= 1) {
    const childLayout = layout.children[index];
    const child = childLayout ? tree.children.find(candidate => candidate.id === childLayout.id) : undefined;
    if (!child || !childLayout) continue;
    const path = hitTest(child, childLayout, x, y);
    if (path.length > 0) return [...path, tree];
  }
  return [tree];
}

export function pathTo(tree: ComponentTreeNode, id: ElementId): readonly ComponentTreeNode[] | undefined {
  if (tree.id === id) return [tree];
  for (const child of tree.children) {
    const path = pathTo(child, id);
    if (path) return [...path, tree];
  }
  return undefined;
}

function collect(tree: ComponentTreeNode, layout: LayoutTreeNode, result: FocusTarget[]): void {
  if (!renderedNode(tree)) return;
  if (tree.props.focusable === true && tree.props.disabled !== true) result.push({ node: tree, layout });
  for (const child of tree.children) {
    const childLayout = layout.children.find(candidate => candidate.id === child.id);
    if (child && childLayout) collect(child, childLayout, result);
  }
}

function contains(layout: LayoutTreeNode, x: number, y: number): boolean {
  if (layout.clip && (x < layout.clip.x || y < layout.clip.y || x >= layout.clip.x + layout.clip.width || y >= layout.clip.y + layout.clip.height)) return false;
  return x >= layout.layout.x && y >= layout.layout.y && x < layout.layout.x + layout.layout.width && y < layout.layout.y + layout.layout.height;
}

function renderedNode(node: ComponentTreeNode): boolean {
  return node.props.visible !== false && (node.type !== "modal" || node.props.open === undefined || (isSignal(node.props.open) ? readReactive(node.props.open) : node.props.open) !== false);
}
