import type { ComponentTreeNode, ElementId, Key, SlateChild } from "./types.js";
import { resolveTree } from "./vnode.js";

export type ReconcileOperation =
  | { readonly type: "insert"; readonly path: string; readonly node: ComponentTreeNode }
  | { readonly type: "remove"; readonly path: string; readonly id: ElementId }
  | { readonly type: "update"; readonly path: string; readonly id: ElementId; readonly changes: Readonly<Record<string, unknown>> }
  | { readonly type: "move"; readonly path: string; readonly id: ElementId; readonly from: number; readonly to: number }
  | { readonly type: "replace"; readonly path: string; readonly previous: ComponentTreeNode; readonly next: ComponentTreeNode };

export interface SlateRoot {
  readonly render: (value: SlateChild) => readonly ReconcileOperation[];
  readonly getTree: () => ComponentTreeNode | null;
  readonly subscribe: (listener: (operations: readonly ReconcileOperation[], tree: ComponentTreeNode | null) => void) => () => void;
}

export function reconcile(previous: ComponentTreeNode | null, next: ComponentTreeNode | null): readonly ReconcileOperation[] {
  const operations: ReconcileOperation[] = [];
  diffNode(previous, next, "/", operations);
  return operations;
}

export function createSlateRoot(initial?: SlateChild): SlateRoot {
  let tree: ComponentTreeNode | null = null;
  const listeners = new Set<(operations: readonly ReconcileOperation[], tree: ComponentTreeNode | null) => void>();
  const render = (value: SlateChild): readonly ReconcileOperation[] => {
    const next = resolveTree(value);
    const operations = reconcile(tree, next);
    tree = next;
    for (const listener of [...listeners]) listener(operations, tree);
    return operations;
  };
  const subscribe = (listener: (operations: readonly ReconcileOperation[], tree: ComponentTreeNode | null) => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const root = { render, getTree: () => tree, subscribe };
  if (initial !== undefined) render(initial);
  return root;
}

function diffNode(previous: ComponentTreeNode | null, next: ComponentTreeNode | null, path: string, operations: ReconcileOperation[]): void {
  if (!previous && next) {
    operations.push({ type: "insert", path, node: next });
    return;
  }
  if (previous && !next) {
    operations.push({ type: "remove", path, id: previous.id });
    return;
  }
  if (!previous || !next) return;
  if (!sameIdentity(previous, next)) {
    operations.push({ type: "replace", path, previous, next });
    return;
  }
  const changes = propChanges(previous, next);
  if (Object.keys(changes).length > 0) operations.push({ type: "update", path, id: next.id, changes });
  diffChildren(previous.children, next.children, path, operations);
}

function diffChildren(previous: readonly ComponentTreeNode[], next: readonly ComponentTreeNode[], path: string, operations: ReconcileOperation[]): void {
  const used = new Set<number>();
  // Keys and IDs are indexed once per level: matching each child with a linear
  // scan turns an unchanged list of n children into O(n^2) comparisons.
  const byKey = new Map<Key, number[]>();
  const byId = new Map<ElementId, number[]>();
  for (let index = 0; index < previous.length; index += 1) {
    const child = previous[index];
    if (!child) continue;
    if (child.key !== null) push(byKey, child.key, index);
    push(byId, child.id, index);
  }
  for (let nextIndex = 0; nextIndex < next.length; nextIndex += 1) {
    const nextChild = next[nextIndex];
    if (!nextChild) continue;
    const previousIndex = findPreviousIndex(previous, nextChild, nextIndex, used, byKey, byId);
    const childPath = `${path}${nextIndex}/`;
    if (previousIndex < 0) {
      operations.push({ type: "insert", path: childPath, node: nextChild });
      continue;
    }
    used.add(previousIndex);
    if (previousIndex !== nextIndex) operations.push({ type: "move", path: childPath, id: nextChild.id, from: previousIndex, to: nextIndex });
    diffNode(previous[previousIndex] ?? null, nextChild, childPath, operations);
  }
  for (let previousIndex = previous.length - 1; previousIndex >= 0; previousIndex -= 1) {
    if (used.has(previousIndex)) continue;
    const previousChild = previous[previousIndex];
    if (previousChild) operations.push({ type: "remove", path: `${path}${previousIndex}/`, id: previousChild.id });
  }
}

function push<K>(index: Map<K, number[]>, key: K, value: number): void {
  const bucket = index.get(key);
  if (bucket) bucket.push(value);
  else index.set(key, [value]);
}

function firstFree(bucket: readonly number[] | undefined, used: ReadonlySet<number>): number {
  if (!bucket) return -1;
  for (const index of bucket) if (!used.has(index)) return index;
  return -1;
}

function findPreviousIndex(previous: readonly ComponentTreeNode[], next: ComponentTreeNode, nextIndex: number, used: Set<number>, byKey: ReadonlyMap<Key, number[]>, byId: ReadonlyMap<ElementId, number[]>): number {
  if (next.key !== null) return firstFree(byKey.get(next.key), used);
  const sameId = firstFree(byId.get(next.id), used);
  if (sameId >= 0) return sameId;
  const positional = previous[nextIndex];
  return positional && positional.key === null && !used.has(nextIndex) ? nextIndex : -1;
}

function sameIdentity(previous: ComponentTreeNode, next: ComponentTreeNode): boolean {
  if (previous.type !== next.type) return false;
  if (previous.key !== null || next.key !== null) return previous.key === next.key;
  return previous.id === next.id;
}

function propChanges(previous: ComponentTreeNode, next: ComponentTreeNode): Readonly<Record<string, unknown>> {
  const changes: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(previous.props), ...Object.keys(next.props)]);
  for (const key of keys) {
    const previousValue = previous.props[key];
    const nextValue = next.props[key];
    if (!sameValue(previousValue, nextValue)) changes[key] = nextValue;
  }
  return changes;
}

/**
 * Prop containers such as `style` are rebuilt on every render, so identity
 * alone reports an update for an unchanged tree. Plain objects and arrays are
 * therefore compared one level deep; anything else keeps identity semantics.
 */
function sameValue(previous: unknown, next: unknown): boolean {
  if (Object.is(previous, next)) return true;
  if (Array.isArray(previous) && Array.isArray(next)) {
    return previous.length === next.length && previous.every((item, index) => Object.is(item, next[index]));
  }
  if (!isPlainObject(previous) || !isPlainObject(next)) return false;
  const previousKeys = Object.keys(previous);
  if (previousKeys.length !== Object.keys(next).length) return false;
  return previousKeys.every(key => Object.prototype.hasOwnProperty.call(next, key) && Object.is(previous[key], next[key]));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
