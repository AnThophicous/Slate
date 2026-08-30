import type { ComponentTreeNode, ElementId, FlexDimension, FlexStyle, HostType } from "./types.js";

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export interface LayoutRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LayoutTreeNode {
  readonly id: ElementId;
  readonly type: HostType;
  readonly layout: LayoutRect;
  readonly children: readonly LayoutTreeNode[];
}

export interface LayoutEngine {
  readonly layout: (tree: ComponentTreeNode, viewport: Viewport) => LayoutTreeNode;
}

export interface YogaNodeLike {
  setWidth(value: number): void;
  setHeight(value: number): void;
  setFlexDirection(value: unknown): void;
  setFlexGrow(value: number): void;
  setFlexShrink(value: number): void;
  setFlexBasis(value: number): void;
  setJustifyContent(value: unknown): void;
  setAlignItems(value: unknown): void;
  setAlignSelf(value: unknown): void;
  setPadding?(edge: unknown, value: number): void;
  setMargin?(edge: unknown, value: number): void;
  setGap?(gutter: unknown, value: number): void;
  setDisplay?(value: unknown): void;
  insertChild(child: YogaNodeLike, index: number): void;
  calculateLayout(width?: number, height?: number, direction?: unknown): void;
  getComputedLeft(): number;
  getComputedTop(): number;
  getComputedWidth(): number;
  getComputedHeight(): number;
  getChildCount(): number;
  getChild(index: number): YogaNodeLike;
  free?(): void;
}

export interface YogaRuntime {
  readonly Node: { readonly create: () => YogaNodeLike };
  readonly [constant: string]: unknown;
}

export interface YogaConstants {
  readonly row?: unknown;
  readonly column?: unknown;
  readonly leftToRight?: unknown;
  readonly auto?: unknown;
  readonly flexStart?: unknown;
  readonly center?: unknown;
  readonly flexEnd?: unknown;
  readonly spaceBetween?: unknown;
  readonly spaceAround?: unknown;
  readonly stretch?: unknown;
  readonly all?: unknown;
  readonly top?: unknown;
  readonly right?: unknown;
  readonly bottom?: unknown;
  readonly left?: unknown;
  readonly gutterAll?: unknown;
  readonly gutterRow?: unknown;
  readonly gutterColumn?: unknown;
  readonly displayNone?: unknown;
}

export interface YogaAdapterOptions {
  readonly constants?: YogaConstants;
  readonly direction?: unknown;
}

export function createFlexLayoutEngine(): LayoutEngine {
  return { layout: (tree, viewport) => layoutNode(tree, { x: 0, y: 0, width: viewport.width, height: viewport.height }, true) };
}

export function createYogaLayoutEngine(runtime: YogaRuntime, options: YogaAdapterOptions = {}): LayoutEngine {
  const constants = options.constants ?? inferYogaConstants(runtime);
  return {
    layout: (tree, viewport) => {
      const root = createYogaNode(tree, runtime, constants);
      root.node.calculateLayout(viewport.width, viewport.height, options.direction ?? constants.leftToRight);
      const result = collectYogaLayout(root.node, tree);
      root.node.free?.();
      return result;
    }
  };
}

function layoutNode(node: ComponentTreeNode, frame: LayoutRect, isRoot: boolean): LayoutTreeNode {
  const style = readStyle(node);
  if (node.props.visible === false || style.display === "none") return { id: node.id, type: node.type, layout: { x: frame.x, y: frame.y, width: 0, height: 0 }, children: [] };
  const layout = isRoot ? { x: readNumber(node.props.x, frame.x), y: readNumber(node.props.y, frame.y), width: dimension(style.width, node.props.width, frame.width), height: dimension(style.height, node.props.height, frame.height) } : frame;
  const padding = readEdges(style, "padding");
  const contentX = layout.x + padding.left;
  const contentY = layout.y + padding.top;
  const contentWidth = Math.max(0, layout.width - padding.left - padding.right);
  const contentHeight = Math.max(0, layout.height - padding.top - padding.bottom);
  const direction = style.flexDirection ?? "column";
  const children = node.children.filter(child => child.props.visible !== false && readStyle(child).display !== "none");
  const mainAvailable = direction === "row" ? contentWidth : contentHeight;
  const crossAvailable = direction === "row" ? contentHeight : contentWidth;
  const baseSizes = children.map(child => baseSize(child, direction));
  const margins = children.map(child => readEdges(readStyle(child), "margin"));
  const gap = direction === "row" ? style.columnGap ?? style.gap ?? 0 : style.rowGap ?? style.gap ?? 0;
  const occupied = baseSizes.reduce((sum, size, index) => sum + size + mainMargin(margins[index], direction), 0) + Math.max(0, children.length - 1) * gap;
  const freeSpace = Math.max(0, mainAvailable - occupied);
  const growTotal = children.reduce((sum, child) => sum + positive(readStyle(child).flexGrow), 0);
  const extraGap = growTotal > 0 ? { offset: 0, gap: 0 } : justifyExtra(style.justifyContent, freeSpace, children.length);
  const spacing = growTotal > 0 ? gap : gap + extraGap.gap;
  let cursor = (direction === "row" ? extraGap.offset : extraGap.offset);
  const layouts: LayoutTreeNode[] = [];
  children.forEach((child, index) => {
    const childStyle = readStyle(child);
    const margin = margins[index] ?? zeroEdges;
    const grow = positive(childStyle.flexGrow);
    const mainSize = clamp(baseSizes[index] + (growTotal > 0 ? freeSpace * grow / growTotal : 0), mainLimit(childStyle, direction));
    const explicitCross = crossSize(child, childStyle, direction);
    const align = childStyle.alignSelf && childStyle.alignSelf !== "auto" ? childStyle.alignSelf : style.alignItems ?? "stretch";
    const childCross = explicitCross ?? (align === "stretch" ? Math.max(0, crossAvailable - crossMargin(margin, direction)) : intrinsicSize(child, direction === "row" ? "height" : "width"));
    const crossOffset = alignOffset(align, crossAvailable - childCross - crossMargin(margin, direction));
    const mainStart = cursor + mainStartMargin(margin, direction);
    const childX = direction === "row" ? contentX + mainStart : contentX + crossOffset + crossStartMargin(margin, direction);
    const childY = direction === "row" ? contentY + crossOffset + crossStartMargin(margin, direction) : contentY + mainStart;
    const childWidth = direction === "row" ? mainSize : childCross;
    const childHeight = direction === "row" ? childCross : mainSize;
    layouts.push(layoutNode(child, { x: childX, y: childY, width: Math.max(0, childWidth), height: Math.max(0, childHeight) }, false));
    cursor += mainSize + mainMargin(margin, direction) + spacing;
  });
  return { id: node.id, type: node.type, layout, children: layouts };
}

function createYogaNode(tree: ComponentTreeNode, runtime: YogaRuntime, constants: YogaConstants): { node: YogaNodeLike } {
  const node = runtime.Node.create();
  applyYogaStyle(node, tree, constants);
  tree.children.forEach((child, index) => node.insertChild(createYogaNode(child, runtime, constants).node, index));
  return { node };
}

function applyYogaStyle(node: YogaNodeLike, tree: ComponentTreeNode, constants: YogaConstants): void {
  const style = readStyle(tree);
  const width = numericDimension(style.width) ?? numberProperty(tree.props.width);
  const height = numericDimension(style.height) ?? numberProperty(tree.props.height);
  if (width !== undefined) node.setWidth(width);
  if (height !== undefined) node.setHeight(height);
  node.setFlexDirection(style.flexDirection === "row" ? constants.row ?? "row" : constants.column ?? "column");
  node.setFlexGrow(positive(style.flexGrow));
  node.setFlexShrink(positive(style.flexShrink));
  const basis = numericDimension(style.flexBasis);
  if (basis !== undefined) node.setFlexBasis(basis);
  node.setJustifyContent(justifyConstant(style.justifyContent, constants));
  node.setAlignItems(alignConstant(style.alignItems, constants));
  if (style.alignSelf !== undefined) node.setAlignSelf(alignConstant(style.alignSelf, constants));
  const padding = readEdges(style, "padding");
  const margin = readEdges(style, "margin");
  applyEdges(node.setPadding, padding, constants);
  applyEdges(node.setMargin, margin, constants);
  if (node.setGap) {
    if (style.gap !== undefined && constants.gutterAll !== undefined) node.setGap(constants.gutterAll, positive(style.gap));
    if (style.rowGap !== undefined && constants.gutterRow !== undefined) node.setGap(constants.gutterRow, positive(style.rowGap));
    if (style.columnGap !== undefined && constants.gutterColumn !== undefined) node.setGap(constants.gutterColumn, positive(style.columnGap));
  }
  if (style.display === "none" && node.setDisplay && constants.displayNone !== undefined) node.setDisplay(constants.displayNone);
}

function collectYogaLayout(node: YogaNodeLike, tree: ComponentTreeNode): LayoutTreeNode {
  const children: LayoutTreeNode[] = [];
  for (let index = 0; index < node.getChildCount(); index += 1) {
    const child = tree.children[index];
    if (child) children.push(collectYogaLayout(node.getChild(index), child));
  }
  return {
    id: tree.id,
    type: tree.type,
    layout: { x: node.getComputedLeft(), y: node.getComputedTop(), width: node.getComputedWidth(), height: node.getComputedHeight() },
    children
  };
}

function inferYogaConstants(runtime: YogaRuntime): YogaConstants {
  const values = runtime as Record<string, unknown>;
  const flexDirection = objectValue(values.FlexDirection);
  const direction = objectValue(values.Direction);
  const justify = objectValue(values.Justify);
  const align = objectValue(values.Align);
  const edge = objectValue(values.Edge);
  const gutter = objectValue(values.Gutter);
  const display = objectValue(values.Display);
  return {
    row: flexDirection?.Row ?? values.FLEX_DIRECTION_ROW,
    column: flexDirection?.Column ?? values.FLEX_DIRECTION_COLUMN,
    leftToRight: direction?.LTR ?? values.DIRECTION_LTR,
    auto: align?.Auto,
    flexStart: justify?.FlexStart ?? align?.FlexStart,
    center: justify?.Center ?? align?.Center,
    flexEnd: justify?.FlexEnd ?? align?.FlexEnd,
    spaceBetween: justify?.SpaceBetween,
    spaceAround: justify?.SpaceAround,
    stretch: align?.Stretch,
    all: edge?.All ?? values.EDGE_ALL,
    top: edge?.Top ?? values.EDGE_TOP,
    right: edge?.Right ?? values.EDGE_RIGHT,
    bottom: edge?.Bottom ?? values.EDGE_BOTTOM,
    left: edge?.Left ?? values.EDGE_LEFT,
    gutterAll: gutter?.All,
    gutterRow: gutter?.Row,
    gutterColumn: gutter?.Column,
    displayNone: display?.None
  };
}

function applyEdges(setter: ((edge: unknown, value: number) => void) | undefined, edges: Edges, constants: YogaConstants): void {
  if (!setter) return;
  const sides = [constants.top, constants.right, constants.bottom, constants.left];
  if (sides.every(side => side !== undefined)) {
    setter(constants.top, edges.top);
    setter(constants.right, edges.right);
    setter(constants.bottom, edges.bottom);
    setter(constants.left, edges.left);
    return;
  }
  if (constants.all !== undefined && edges.top === edges.right && edges.right === edges.bottom && edges.bottom === edges.left) setter(constants.all, edges.top);
}

function readStyle(node: ComponentTreeNode): FlexStyle {
  const style = node.props.style;
  return typeof style === "object" && style !== null ? style as FlexStyle : {};
}

function dimension(styleValue: FlexDimension | undefined, propValue: unknown, fallback: number): number {
  return numericDimension(styleValue) ?? numberProperty(propValue) ?? fallback;
}

function numericDimension(value: FlexDimension | unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : undefined;
}

function numberProperty(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : undefined;
}

function readNumber(value: unknown, fallback: number): number {
  return numberProperty(value) ?? fallback;
}

function positive(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

interface Edges {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

const zeroEdges: Edges = { top: 0, right: 0, bottom: 0, left: 0 };

function readEdges(style: FlexStyle, kind: "padding" | "margin"): Edges {
  const all = positive(style[kind]);
  const top = kind === "padding" ? style.paddingTop : style.marginTop;
  const right = kind === "padding" ? style.paddingRight : style.marginRight;
  const bottom = kind === "padding" ? style.paddingBottom : style.marginBottom;
  const left = kind === "padding" ? style.paddingLeft : style.marginLeft;
  return {
    top: top === undefined ? all : positive(top),
    right: right === undefined ? all : positive(right),
    bottom: bottom === undefined ? all : positive(bottom),
    left: left === undefined ? all : positive(left)
  };
}

function baseSize(node: ComponentTreeNode, direction: "row" | "column"): number {
  const style = readStyle(node);
  const main = direction === "row" ? style.width : style.height;
  const basis = style.flexBasis;
  return numericDimension(basis) ?? numericDimension(main) ?? numberProperty(node.props[direction === "row" ? "width" : "height"]) ?? intrinsicSize(node, direction === "row" ? "width" : "height");
}

function crossSize(node: ComponentTreeNode, style: FlexStyle, direction: "row" | "column"): number | undefined {
  const value = direction === "row" ? style.height : style.width;
  return numericDimension(value) ?? numberProperty(node.props[direction === "row" ? "height" : "width"]);
}

function intrinsicSize(node: ComponentTreeNode, axis: "width" | "height"): number {
  const text = typeof node.props.text === "string" ? node.props.text : typeof node.props.label === "string" ? node.props.label : "";
  const lines = text.split("\n");
  const own = axis === "width" ? Math.max(1, ...lines.map(line => [...line].length)) : Math.max(1, lines.length);
  if (node.children.length === 0) return own;
  const direction = readStyle(node).flexDirection ?? "column";
  const children = node.children.filter(child => child.props.visible !== false);
  if (axis === "width") {
    const childWidth = direction === "row" ? children.reduce((sum, child) => sum + intrinsicSize(child, "width"), 0) : Math.max(0, ...children.map(child => intrinsicSize(child, "width")));
    return Math.max(own, childWidth);
  }
  const childHeight = direction === "column" ? children.reduce((sum, child) => sum + intrinsicSize(child, "height"), 0) : Math.max(0, ...children.map(child => intrinsicSize(child, "height")));
  return Math.max(own, childHeight);
}

function mainLimit(style: FlexStyle, direction: "row" | "column"): { readonly min: number; readonly max: number } {
  return direction === "row" ? { min: positive(style.minWidth), max: style.maxWidth === undefined ? Number.POSITIVE_INFINITY : positive(style.maxWidth) } : { min: positive(style.minHeight), max: style.maxHeight === undefined ? Number.POSITIVE_INFINITY : positive(style.maxHeight) };
}

function clamp(value: number, limits: { readonly min: number; readonly max: number }): number {
  return Math.min(limits.max, Math.max(limits.min, value));
}

function mainMargin(edges: Edges, direction: "row" | "column"): number {
  return direction === "row" ? edges.left + edges.right : edges.top + edges.bottom;
}

function crossMargin(edges: Edges, direction: "row" | "column"): number {
  return direction === "row" ? edges.top + edges.bottom : edges.left + edges.right;
}

function mainStartMargin(edges: Edges, direction: "row" | "column"): number {
  return direction === "row" ? edges.left : edges.top;
}

function crossStartMargin(edges: Edges, direction: "row" | "column"): number {
  return direction === "row" ? edges.top : edges.left;
}

function justifyExtra(value: FlexStyle["justifyContent"], free: number, count: number): { readonly offset: number; readonly gap: number } {
  if (count < 1 || free <= 0) return { offset: 0, gap: 0 };
  if (value === "center") return { offset: free / 2, gap: 0 };
  if (value === "flex-end") return { offset: free, gap: 0 };
  if (value === "space-between" && count > 1) return { offset: 0, gap: free / (count - 1) };
  if (value === "space-around") return { offset: free / (count * 2), gap: free / count };
  return { offset: 0, gap: 0 };
}

function alignOffset(value: FlexStyle["alignItems"] | FlexStyle["alignSelf"], free: number): number {
  if (free <= 0 || value === "stretch" || value === "flex-start" || value === "auto" || value === undefined) return 0;
  if (value === "center") return free / 2;
  return free;
}

function justifyConstant(value: FlexStyle["justifyContent"], constants: YogaConstants): unknown {
  if (value === "center") return constants.center ?? "center";
  if (value === "flex-end") return constants.flexEnd ?? "flex-end";
  if (value === "space-between") return constants.spaceBetween ?? "space-between";
  if (value === "space-around") return constants.spaceAround ?? "space-around";
  return constants.flexStart ?? "flex-start";
}

function alignConstant(value: FlexStyle["alignItems"] | FlexStyle["alignSelf"], constants: YogaConstants): unknown {
  if (value === "center") return constants.center ?? "center";
  if (value === "flex-end") return constants.flexEnd ?? "flex-end";
  if (value === "auto") return constants.auto ?? "auto";
  if (value === "stretch" || value === undefined) return constants.stretch ?? "stretch";
  return constants.flexStart ?? "flex-start";
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}
