import { isSignal, readReactive } from "./reactive.js";
import { displayWidth, splitLines, wrappedLineCount } from "./text.js";
import type { ComponentTreeNode, ElementId, FlexDimension, FlexStyle, HostType, Overflow } from "./types.js";

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
  readonly content: LayoutRect;
  readonly children: readonly LayoutTreeNode[];
  readonly scrollWidth: number;
  readonly scrollHeight: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly overflowX: Overflow;
  readonly overflowY: Overflow;
  readonly clip: LayoutRect | null;
}

export interface LayoutEngine {
  readonly layout: (tree: ComponentTreeNode, viewport: Viewport) => LayoutTreeNode;
}

export interface YogaNodeLike {
  setWidth?(value: number): void;
  setWidthPercent?(value: number): void;
  setHeight?(value: number): void;
  setHeightPercent?(value: number): void;
  setMinWidth?(value: number): void;
  setMinWidthPercent?(value: number): void;
  setMaxWidth?(value: number): void;
  setMaxWidthPercent?(value: number): void;
  setMinHeight?(value: number): void;
  setMinHeightPercent?(value: number): void;
  setMaxHeight?(value: number): void;
  setMaxHeightPercent?(value: number): void;
  setFlexDirection(value: unknown): void;
  setFlexWrap?(value: unknown): void;
  setFlexGrow(value: number): void;
  setFlexShrink(value: number): void;
  setFlexBasis?(value: number): void;
  setFlexBasisPercent?(value: number): void;
  setJustifyContent(value: unknown): void;
  setAlignItems(value: unknown): void;
  setAlignSelf(value: unknown): void;
  setAlignContent?(value: unknown): void;
  setPadding?(edge: unknown, value: number): void;
  setPaddingPercent?(edge: unknown, value: number): void;
  setMargin?(edge: unknown, value: number): void;
  setMarginPercent?(edge: unknown, value: number): void;
  setGap?(gutter: unknown, value: number): void;
  setGapPercent?(gutter: unknown, value: number): void;
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
  readonly wrap?: unknown;
  readonly nowrap?: unknown;
  readonly leftToRight?: unknown;
  readonly auto?: unknown;
  readonly flexStart?: unknown;
  readonly center?: unknown;
  readonly flexEnd?: unknown;
  readonly spaceBetween?: unknown;
  readonly spaceAround?: unknown;
  readonly spaceEvenly?: unknown;
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
  return {
    layout: (tree, viewport) => layoutNode(tree, {
      x: readNumber(tree.props.x, 0),
      y: readNumber(tree.props.y, 0),
      width: Math.max(0, readDimension(tree.props.width, viewport.width, viewport.width)),
      height: Math.max(0, readDimension(tree.props.height, viewport.height, viewport.height))
    }, true, null)
  };
}

export function createYogaLayoutEngine(runtime: YogaRuntime, options: YogaAdapterOptions = {}): LayoutEngine {
  const constants = options.constants ?? inferYogaConstants(runtime);
  return {
    layout: (tree, viewport) => {
      const root = createYogaNode(tree, runtime, constants);
      root.node.calculateLayout(viewport.width, viewport.height, options.direction ?? constants.leftToRight);
      const result = collectYogaLayout(root.node, tree, null);
      root.node.free?.();
      return result;
    }
  };
}

function layoutNode(node: ComponentTreeNode, frame: LayoutRect, isRoot: boolean, parentClip: LayoutRect | null): LayoutTreeNode {
  const style = readStyle(node);
  if (!renderedNode(node)) return emptyLayout(node, frame, parentClip);
  const layout = isRoot ? rootFrame(node, frame) : snapRect(frame);
  const padding = readEdges(style, "padding", layout.width, layout.height);
  const content = {
    x: layout.x + padding.left,
    y: layout.y + padding.top,
    width: Math.max(0, layout.width - padding.left - padding.right),
    height: Math.max(0, layout.height - padding.top - padding.bottom)
  };
  const overflowX = style.overflowX ?? style.overflow ?? "visible";
  const overflowY = style.overflowY ?? style.overflow ?? "visible";
  const clip = clipFor(overflowX, overflowY, layout, parentClip);
  const childLayouts = layoutChildren(node, content, style, clip);
  const contentRight = Math.max(content.x + content.width, ...childLayouts.map(child => child.layout.x + child.layout.width));
  const contentBottom = Math.max(content.y + content.height, ...childLayouts.map(child => child.layout.y + child.layout.height));
  const scrollWidth = Math.max(content.width, contentRight - content.x);
  const scrollHeight = Math.max(content.height, contentBottom - content.y);
  const requestedLeft = readNumber(style.scrollLeft, readNumber(node.props.scrollLeft, 0));
  const requestedTop = readNumber(style.scrollTop, readNumber(node.props.scrollTop, 0));
  const scrollLeft = scrollable(overflowX) ? clamp(requestedLeft, 0, Math.max(0, scrollWidth - content.width)) : 0;
  const scrollTop = scrollable(overflowY) ? clamp(requestedTop, 0, Math.max(0, scrollHeight - content.height)) : 0;
  const children = childLayouts.map(child => translateLayout(child, -scrollLeft, -scrollTop, clip));
  return {
    id: node.id,
    type: node.type,
    layout,
    content: snapRect(content),
    children,
    scrollWidth: Math.round(scrollWidth),
    scrollHeight: Math.round(scrollHeight),
    scrollLeft: Math.round(scrollLeft),
    scrollTop: Math.round(scrollTop),
    overflowX,
    overflowY,
    clip
  };
}

function layoutChildren(node: ComponentTreeNode, content: LayoutRect, style: FlexStyle, clip: LayoutRect | null): LayoutTreeNode[] {
  const direction = style.flexDirection ?? "column";
  const wrap = style.flexWrap ?? "nowrap";
  const allChildren = node.children.filter(renderedNode);
  const children = allChildren.filter(child => readStyle(child).position !== "absolute");
  const absoluteChildren = allChildren.filter(child => readStyle(child).position === "absolute");
  if (allChildren.length === 0) return [];
  const result: LayoutTreeNode[] = [];
  if (children.length > 0) {
  const mainSize = direction === "row" ? content.width : content.height;
  const crossSize = direction === "row" ? content.height : content.width;
  const mainGap = resolveGap(direction === "row" ? style.columnGap ?? style.gap : style.rowGap ?? style.gap, mainSize);
  const crossGap = resolveGap(direction === "row" ? style.rowGap ?? style.gap : style.columnGap ?? style.gap, crossSize);
  const metrics = children.map(child => metric(child, direction, content.width, content.height));
  const lines: Metric[][] = [[]];
  for (const current of metrics) {
    const line = lines[lines.length - 1];
    const occupied = line.reduce((sum, item) => sum + item.baseMain + item.mainMargin, 0) + Math.max(0, line.length) * mainGap;
    if (wrap !== "nowrap" && line.length > 0 && occupied + current.baseMain + current.mainMargin > mainSize) lines.push([current]);
    else line.push(current);
  }
  const lineCrossSizes = lines.map(line => Math.max(0, ...line.map(item => item.baseCross + item.crossMargin)));
  const totalCross = lineCrossSizes.reduce((sum, size) => sum + size, 0) + Math.max(0, lines.length - 1) * crossGap;
  const freeCross = Math.max(0, crossSize - totalCross);
  const contentDistribution = distributeCross(style.alignContent, freeCross, lines.length, crossGap);
  const reverseCross = wrap === "wrap-reverse";
  let crossCursor = reverseCross ? crossSize - contentDistribution.offset : contentDistribution.offset;
  lines.forEach((line, lineIndex) => {
    const sizes = resolveFlexSizes(line, mainSize, mainGap);
    const occupied = sizes.reduce((sum, size, index) => sum + size + (line[index]?.mainMargin ?? 0), 0) + Math.max(0, line.length - 1) * mainGap;
    const distribution = distributeMain(style.justifyContent, Math.max(0, mainSize - occupied), line.length, mainGap);
    let mainCursor = distribution.offset;
    const currentLineCross = lineCrossSizes[lineIndex] ?? 0;
    const lineCrossStart = reverseCross ? crossCursor - currentLineCross : crossCursor;
    line.forEach((item, itemIndex) => {
      const childStyle = item.style;
      const align = childStyle.alignSelf && childStyle.alignSelf !== "auto" ? childStyle.alignSelf : style.alignItems ?? "stretch";
      const cross = align === "stretch" && item.explicitCross === undefined ? Math.max(0, currentLineCross - item.crossMargin) : item.baseCross;
      const crossFree = Math.max(0, currentLineCross - cross - item.crossMargin);
      const crossOffset = alignOffset(align, crossFree);
      const main = sizes[itemIndex] ?? item.baseMain;
      const x = direction === "row" ? content.x + mainCursor + item.margin.left : content.x + lineCrossStart + crossOffset + item.margin.left;
      const y = direction === "row" ? content.y + lineCrossStart + crossOffset + item.margin.top : content.y + mainCursor + item.margin.top;
      const child = layoutNode(item.node, { x, y, width: direction === "row" ? main : cross, height: direction === "row" ? cross : main }, false, clip);
      result.push(child);
      mainCursor += main + item.mainMargin + distribution.gap;
    });
    if (reverseCross) crossCursor -= currentLineCross + contentDistribution.gap;
    else crossCursor += currentLineCross + contentDistribution.gap;
  });
  }
  for (const child of absoluteChildren) result.push(layoutAbsolute(child, content, clip));
  const order = new Map(allChildren.map((child, index) => [child.id, index]));
  result.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
  return result;
}

function layoutAbsolute(node: ComponentTreeNode, content: LayoutRect, clip: LayoutRect | null): LayoutTreeNode {
  const style = readStyle(node);
  const leftValue = style.left ?? node.props.left;
  const rightValue = style.right ?? node.props.right;
  const topValue = style.top ?? node.props.top;
  const bottomValue = style.bottom ?? node.props.bottom;
  const left = resolveDimension(leftValue, content.width, 0);
  const right = resolveDimension(rightValue, content.width, 0);
  const top = resolveDimension(topValue, content.height, 0);
  const bottom = resolveDimension(bottomValue, content.height, 0);
  const widthValue = style.width ?? node.props.width;
  const heightValue = style.height ?? node.props.height;
  const intrinsicWidth = intrinsicSize(node, "width", content.width);
  const intrinsicHeight = intrinsicSize(node, "height", content.width);
  const width = isAuto(widthValue) && !isAuto(leftValue) && !isAuto(rightValue) ? Math.max(0, content.width - left - right) : resolveDimension(widthValue, content.width, intrinsicWidth);
  const height = isAuto(heightValue) && !isAuto(topValue) && !isAuto(bottomValue) ? Math.max(0, content.height - top - bottom) : resolveDimension(heightValue, content.height, intrinsicHeight);
  const minWidth = resolveDimension(style.minWidth ?? node.props.minWidth, content.width, 0);
  const maxWidth = isAuto(style.maxWidth ?? node.props.maxWidth) ? Number.POSITIVE_INFINITY : resolveDimension(style.maxWidth ?? node.props.maxWidth, content.width, Number.POSITIVE_INFINITY);
  const minHeight = resolveDimension(style.minHeight ?? node.props.minHeight, content.height, 0);
  const maxHeight = isAuto(style.maxHeight ?? node.props.maxHeight) ? Number.POSITIVE_INFINITY : resolveDimension(style.maxHeight ?? node.props.maxHeight, content.height, Number.POSITIVE_INFINITY);
  const resolvedWidth = clamp(width, minWidth, maxWidth);
  const resolvedHeight = clamp(height, minHeight, maxHeight);
  const x = isAuto(leftValue) && !isAuto(rightValue) ? content.x + content.width - right - resolvedWidth : content.x + left;
  const y = isAuto(topValue) && !isAuto(bottomValue) ? content.y + content.height - bottom - resolvedHeight : content.y + top;
  return layoutNode(node, { x, y, width: resolvedWidth, height: resolvedHeight }, false, clip);
}

interface Metric {
  readonly node: ComponentTreeNode;
  readonly style: FlexStyle;
  readonly margin: Edges;
  readonly mainMargin: number;
  readonly crossMargin: number;
  readonly baseMain: number;
  readonly baseCross: number;
  readonly explicitCross: number | undefined;
  readonly grow: number;
  readonly shrink: number;
  readonly minMain: number;
  readonly maxMain: number;
}

function metric(node: ComponentTreeNode, direction: "row" | "column", parentWidth: number, parentHeight: number): Metric {
  const style = readStyle(node);
  const margin = readEdges(style, "margin", parentWidth, parentHeight);
  const mainBasis = direction === "row" ? parentWidth : parentHeight;
  const crossBasis = direction === "row" ? parentHeight : parentWidth;
  const mainValue = direction === "row" ? style.width ?? node.props.width : style.height ?? node.props.height;
  const crossValue = direction === "row" ? style.height ?? node.props.height : style.width ?? node.props.width;
  const basisValue = style.flexBasis;
  const intrinsicMain = intrinsicSize(node, direction === "row" ? "width" : "height", parentWidth);
  const intrinsicCross = intrinsicSize(node, direction === "row" ? "height" : "width", parentWidth);
  const baseMain = resolveDimension(basisValue, mainBasis, resolveDimension(mainValue, mainBasis, intrinsicMain));
  const explicitCross = isAuto(crossValue) ? undefined : resolveDimension(crossValue, crossBasis, intrinsicCross);
  const baseCross = explicitCross ?? intrinsicCross;
  const minValue = direction === "row" ? style.minWidth ?? node.props.minWidth : style.minHeight ?? node.props.minHeight;
  const maxValue = direction === "row" ? style.maxWidth ?? node.props.maxWidth : style.maxHeight ?? node.props.maxHeight;
  const minMain = resolveDimension(minValue, mainBasis, 0);
  const maxMain = maxValue === undefined || isAuto(maxValue) ? Number.POSITIVE_INFINITY : resolveDimension(maxValue, mainBasis, Number.POSITIVE_INFINITY);
  return {
    node,
    style,
    margin,
    mainMargin: direction === "row" ? margin.left + margin.right : margin.top + margin.bottom,
    crossMargin: direction === "row" ? margin.top + margin.bottom : margin.left + margin.right,
    baseMain: clamp(baseMain, minMain, maxMain),
    baseCross,
    explicitCross,
    grow: positive(style.flexGrow),
    shrink: style.flexShrink === undefined ? 1 : positive(style.flexShrink),
    minMain,
    maxMain
  };
}

function resolveFlexSizes(line: readonly Metric[], available: number, gap: number): number[] {
  const sizes = line.map(item => item.baseMain);
  const margins = line.reduce((sum, item) => sum + item.mainMargin, 0);
  const occupied = sizes.reduce((sum, size) => sum + size, 0) + margins + Math.max(0, line.length - 1) * gap;
  let free = available - occupied;
  if (Math.abs(free) < 0.001) return pixelSizes(sizes, line, available, gap, margins);
  const factors = line.map(item => free > 0 ? item.grow : item.shrink * item.baseMain);
  const active = new Set(line.map((_item, index) => index));
  for (let pass = 0; pass < line.length + 1 && active.size > 0; pass += 1) {
    const factorTotal = [...active].reduce((sum, index) => sum + (factors[index] ?? 0), 0);
    if (factorTotal <= 0) break;
    let frozen = false;
    for (const index of [...active]) {
      const item = line[index];
      if (!item) continue;
      const candidate = sizes[index] + free * (factors[index] ?? 0) / factorTotal;
      const clamped = clamp(candidate, item.minMain, item.maxMain);
      sizes[index] = clamped;
      if (Math.abs(candidate - clamped) > 0.001) {
        active.delete(index);
        frozen = true;
      }
    }
    const nextOccupied = sizes.reduce((sum, size) => sum + size, 0) + margins + Math.max(0, line.length - 1) * gap;
    free = available - nextOccupied;
    if (!frozen) break;
  }
  return pixelSizes(sizes, line, available, gap, margins);
}

function pixelSizes(values: readonly number[], line: readonly Metric[], available: number, gap: number, margins: number): number[] {
  const lower = line.map(item => Math.max(0, Math.ceil(item.minMain)));
  const upper = line.map((item, index) => Number.isFinite(item.maxMain) ? Math.max(lower[index] ?? 0, Math.floor(item.maxMain)) : Math.max(lower[index] ?? 0, Math.floor(Math.max(0, available - margins - Math.max(0, line.length - 1) * gap))));
  const capacity = Math.max(0, Math.floor(available - margins - Math.max(0, line.length - 1) * gap));
  const sumLower = lower.reduce((sum, value) => sum + value, 0);
  const target = Math.max(sumLower, Math.min(Math.round(values.reduce((sum, value) => sum + Math.max(0, value), 0)), capacity));
  const result = values.map((value, index) => Math.max(lower[index] ?? 0, Math.min(upper[index] ?? capacity, Math.floor(Math.max(0, value)))));
  let difference = target - result.reduce((sum, value) => sum + value, 0);
  const fractions = values.map((value, index) => ({ index, fraction: Math.max(0, value) - Math.floor(Math.max(0, value)) }));
  fractions.sort((left, right) => right.fraction - left.fraction || right.index - left.index);
  for (const candidate of fractions) {
    if (difference <= 0) break;
    const index = candidate.index;
    if ((result[index] ?? 0) < (upper[index] ?? capacity)) {
      result[index] = (result[index] ?? 0) + 1;
      difference -= 1;
    }
  }
  fractions.reverse();
  for (const candidate of fractions) {
    if (difference >= 0) break;
    const index = candidate.index;
    if ((result[index] ?? 0) > (lower[index] ?? 0)) {
      result[index] = (result[index] ?? 0) - 1;
      difference += 1;
    }
  }
  return result;
}

function distributeMain(value: FlexStyle["justifyContent"], free: number, count: number, gap: number): { offset: number; gap: number } {
  if (count < 1 || free <= 0) return { offset: 0, gap };
  if (value === "center") return { offset: free / 2, gap };
  if (value === "flex-end") return { offset: free, gap };
  if (value === "space-between" && count > 1) return { offset: 0, gap: gap + free / (count - 1) };
  if (value === "space-around") return { offset: free / (count * 2), gap: gap + free / count };
  if (value === "space-evenly") return { offset: free / (count + 1), gap: gap + free / (count + 1) };
  return { offset: 0, gap };
}

function distributeCross(value: FlexStyle["alignContent"], free: number, count: number, gap: number): { offset: number; gap: number } {
  if (count < 1 || free <= 0) return { offset: 0, gap };
  if (value === "center") return { offset: free / 2, gap };
  if (value === "flex-end") return { offset: free, gap };
  if (value === "space-between" && count > 1) return { offset: 0, gap: gap + free / (count - 1) };
  if (value === "space-around") return { offset: free / (count * 2), gap: gap + free / count };
  if (value === "space-evenly") return { offset: free / (count + 1), gap: gap + free / (count + 1) };
  return { offset: 0, gap };
}

function alignOffset(value: FlexStyle["alignItems"] | FlexStyle["alignSelf"], free: number): number {
  if (free <= 0 || value === "stretch" || value === "flex-start" || value === "auto" || value === undefined) return 0;
  if (value === "center") return free / 2;
  return free;
}

function rootFrame(node: ComponentTreeNode, fallback: LayoutRect): LayoutRect {
  const style = readStyle(node);
  return snapRect({
    x: readNumber(node.props.x, fallback.x),
    y: readNumber(node.props.y, fallback.y),
    width: resolveDimension(style.width ?? node.props.width, fallback.width, fallback.width),
    height: resolveDimension(style.height ?? node.props.height, fallback.height, fallback.height)
  });
}

function emptyLayout(node: ComponentTreeNode, frame: LayoutRect, clip: LayoutRect | null): LayoutTreeNode {
  const layout = snapRect({ x: frame.x, y: frame.y, width: 0, height: 0 });
  return { id: node.id, type: node.type, layout, content: layout, children: [], scrollWidth: 0, scrollHeight: 0, scrollLeft: 0, scrollTop: 0, overflowX: "hidden", overflowY: "hidden", clip };
}

function translateLayout(node: LayoutTreeNode, dx: number, dy: number, parentClip: LayoutRect | null): LayoutTreeNode {
  const layout = { ...node.layout, x: node.layout.x + dx, y: node.layout.y + dy };
  const content = { ...node.content, x: node.content.x + dx, y: node.content.y + dy };
  const shiftedLayout = snapRect(layout);
  const ownClip = node.overflowX === "visible" && node.overflowY === "visible" ? null : shiftedLayout;
  const clip = parentClip && ownClip ? intersect(parentClip, ownClip) : parentClip ?? ownClip;
  return { ...node, layout: shiftedLayout, content: snapRect(content), clip, children: node.children.map(child => translateLayout(child, dx, dy, clip)) };
}

function clipFor(x: Overflow, y: Overflow, layout: LayoutRect, parent: LayoutRect | null): LayoutRect | null {
  const local = x === "visible" && y === "visible" ? null : layout;
  return parent && local ? intersect(parent, local) : parent ?? local;
}

function intersect(a: LayoutRect, b: LayoutRect): LayoutRect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

function readStyle(node: ComponentTreeNode): FlexStyle {
  const style = node.props.style;
  return isRecord(style) ? style as FlexStyle : {};
}

function renderedNode(node: ComponentTreeNode): boolean {
  if (node.props.visible === false || readStyle(node).display === "none") return false;
  return node.type !== "modal" || node.props.open === undefined || readReactive(node.props.open as never) !== false;
}

interface Edges {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

function readEdges(style: FlexStyle, kind: "padding" | "margin", width: number, height: number): Edges {
  const all = resolveDimension(style[kind], width, 0);
  const prefix = kind;
  return {
    top: resolveDimension(style[`${prefix}Top` as keyof FlexStyle] as FlexDimension | undefined, height, all),
    right: resolveDimension(style[`${prefix}Right` as keyof FlexStyle] as FlexDimension | undefined, width, all),
    bottom: resolveDimension(style[`${prefix}Bottom` as keyof FlexStyle] as FlexDimension | undefined, height, all),
    left: resolveDimension(style[`${prefix}Left` as keyof FlexStyle] as FlexDimension | undefined, width, all)
  };
}

function resolveGap(value: FlexDimension | undefined, basis: number): number {
  return resolveDimension(value, basis, 0);
}

function resolveDimension(value: unknown, basis: number, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value === "string" && value.endsWith("%")) {
    const percentage = Number(value.slice(0, -1));
    if (Number.isFinite(percentage)) return Math.max(0, basis * percentage / 100);
  }
  return fallback;
}

function readDimension(value: unknown, basis: number, fallback: number): number {
  return resolveDimension(value, basis, fallback);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function positive(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function isAuto(value: unknown): boolean {
  return value === "auto" || value === undefined;
}

function scrollable(value: Overflow): boolean {
  return value === "scroll" || value === "auto";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snapRect(value: LayoutRect): LayoutRect {
  return { x: Math.round(value.x), y: Math.round(value.y), width: Math.max(0, Math.round(value.width)), height: Math.max(0, Math.round(value.height)) };
}

function intrinsicSize(node: ComponentTreeNode, axis: "width" | "height", availableWidth = Number.POSITIVE_INFINITY): number {
  const ownText = readText(node);
  const lines = splitLines(ownText);
  const textWidth = textWidthConstraint(node, availableWidth);
  const own = axis === "width"
    ? Math.max(1, ...lines.map(displayWidth))
    : Math.max(1, node.props.wrapText === false ? lines.length : wrappedLineCount(ownText, textWidth));
  if (node.children.length === 0) return own;
  const style = readStyle(node);
  const direction = style.flexDirection ?? "column";
  const children = node.children.filter(renderedNode);
  if (axis === "width") {
    const childWidth = direction === "row"
      ? children.reduce((sum, child) => sum + intrinsicSize(child, "width", availableWidth), 0)
      : Math.max(0, ...children.map(child => intrinsicSize(child, "width", availableWidth)));
    return Math.max(own, childWidth);
  }
  const childHeight = direction === "column"
    ? children.reduce((sum, child) => sum + intrinsicSize(child, "height", textWidth), 0)
    : Math.max(0, ...children.map(child => intrinsicSize(child, "height", textWidth)));
  return Math.max(own, childHeight);
}

function textWidthConstraint(node: ComponentTreeNode, availableWidth: number): number {
  const style = readStyle(node);
  const requested = style.width ?? node.props.width;
  if (requested === "auto" || requested === undefined) return availableWidth;
  if (typeof requested === "number" && Number.isFinite(requested)) return Math.max(1, requested);
  if (typeof requested === "string" && requested.endsWith("%") && Number.isFinite(availableWidth)) {
    const percentage = Number(requested.slice(0, -1));
    if (Number.isFinite(percentage)) return Math.max(1, availableWidth * percentage / 100);
  }
  return availableWidth;
}

function readText(node: ComponentTreeNode): string {
  const value = node.type === "button" ? node.props.label ?? node.props.text : node.props.text ?? node.props.label ?? node.props.placeholder;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (isSignal(value)) return String(readReactive(value));
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createYogaNode(tree: ComponentTreeNode, runtime: YogaRuntime, constants: YogaConstants): { node: YogaNodeLike } {
  const node = runtime.Node.create();
  applyYogaStyle(node, tree, constants);
  tree.children.forEach((child, index) => node.insertChild(createYogaNode(child, runtime, constants).node, index));
  return { node };
}

function applyYogaStyle(node: YogaNodeLike, tree: ComponentTreeNode, constants: YogaConstants): void {
  const style = readStyle(tree);
  applyDimension(node.setWidth, node.setWidthPercent, style.width ?? tree.props.width);
  applyDimension(node.setHeight, node.setHeightPercent, style.height ?? tree.props.height);
  applyConstraint(node.setMinWidth, node.setMinWidthPercent, style.minWidth ?? tree.props.minWidth);
  applyConstraint(node.setMaxWidth, node.setMaxWidthPercent, style.maxWidth ?? tree.props.maxWidth);
  applyConstraint(node.setMinHeight, node.setMinHeightPercent, style.minHeight ?? tree.props.minHeight);
  applyConstraint(node.setMaxHeight, node.setMaxHeightPercent, style.maxHeight ?? tree.props.maxHeight);
  node.setFlexDirection(style.flexDirection === "row" ? constants.row ?? "row" : constants.column ?? "column");
  if (node.setFlexWrap) node.setFlexWrap(style.flexWrap === "wrap" ? constants.wrap ?? "wrap" : constants.nowrap ?? "nowrap");
  node.setFlexGrow(positive(style.flexGrow));
  node.setFlexShrink(style.flexShrink === undefined ? 1 : positive(style.flexShrink));
  applyBasis(node, style.flexBasis);
  node.setJustifyContent(justifyConstant(style.justifyContent, constants));
  node.setAlignItems(alignConstant(style.alignItems, constants));
  if (style.alignSelf !== undefined) node.setAlignSelf(alignConstant(style.alignSelf, constants));
  if (node.setAlignContent) node.setAlignContent(alignConstant(style.alignContent, constants));
  const padding = readEdges(style, "padding", 100, 100);
  const margin = readEdges(style, "margin", 100, 100);
  applyEdges(node.setPadding, node.setPaddingPercent, padding, constants);
  applyEdges(node.setMargin, node.setMarginPercent, margin, constants);
  if (node.setGap) {
    applyGap(node, node.setGap, node.setGapPercent, constants.gutterAll, style.gap);
    applyGap(node, node.setGap, node.setGapPercent, constants.gutterRow, style.rowGap);
    applyGap(node, node.setGap, node.setGapPercent, constants.gutterColumn, style.columnGap);
  }
  if (style.display === "none" && node.setDisplay && constants.displayNone !== undefined) node.setDisplay(constants.displayNone);
}

function collectYogaLayout(node: YogaNodeLike, tree: ComponentTreeNode, parentClip: LayoutRect | null): LayoutTreeNode {
  const layout = snapRect({ x: node.getComputedLeft(), y: node.getComputedTop(), width: node.getComputedWidth(), height: node.getComputedHeight() });
  const style = readStyle(tree);
  const padding = readEdges(style, "padding", layout.width, layout.height);
  const content = snapRect({ x: layout.x + padding.left, y: layout.y + padding.top, width: Math.max(0, layout.width - padding.left - padding.right), height: Math.max(0, layout.height - padding.top - padding.bottom) });
  const children: LayoutTreeNode[] = [];
  for (let index = 0; index < node.getChildCount(); index += 1) {
    const child = tree.children[index];
    if (child) children.push(collectYogaLayout(node.getChild(index), child, parentClip));
  }
  const overflowX = style.overflowX ?? style.overflow ?? "visible";
  const overflowY = style.overflowY ?? style.overflow ?? "visible";
  return { id: tree.id, type: tree.type, layout, content, children, scrollWidth: layout.width, scrollHeight: layout.height, scrollLeft: 0, scrollTop: 0, overflowX, overflowY, clip: clipFor(overflowX, overflowY, layout, parentClip) };
}

function applyDimension(setter: ((value: number) => void) | undefined, percentSetter: ((value: number) => void) | undefined, value: unknown): void {
  if (typeof value === "number" && Number.isFinite(value)) setter?.(Math.max(0, value));
  else if (typeof value === "string" && value.endsWith("%")) percentSetter?.(positive(Number(value.slice(0, -1))));
}

function applyConstraint(setter: ((value: number) => void) | undefined, percentSetter: ((value: number) => void) | undefined, value: unknown): void {
  applyDimension(setter, percentSetter, value);
}

function applyBasis(node: YogaNodeLike, value: FlexDimension | undefined): void {
  if (typeof value === "number") node.setFlexBasis?.(Math.max(0, value));
  else if (typeof value === "string" && value.endsWith("%")) node.setFlexBasisPercent?.(positive(Number(value.slice(0, -1))));
}

function applyEdges(setter: ((edge: unknown, value: number) => void) | undefined, percentSetter: ((edge: unknown, value: number) => void) | undefined, edges: Edges, constants: YogaConstants): void {
  const sides = [[constants.top, edges.top], [constants.right, edges.right], [constants.bottom, edges.bottom], [constants.left, edges.left]] as const;
  if (sides.every(([side]) => side !== undefined)) {
    for (const [side, value] of sides) setter?.(side, value);
    return;
  }
  if (constants.all !== undefined && edges.top === edges.right && edges.right === edges.bottom && edges.bottom === edges.left) setter?.(constants.all, edges.top);
  void percentSetter;
}

function applyGap(node: YogaNodeLike, setter: (gutter: unknown, value: number) => void, percentSetter: ((gutter: unknown, value: number) => void) | undefined, gutter: unknown, value: FlexDimension | undefined): void {
  if (gutter === undefined || value === undefined) return;
  if (typeof value === "number") setter(gutter, positive(value));
  else if (value.endsWith("%")) percentSetter?.(gutter, positive(Number(value.slice(0, -1))));
  void node;
}

function inferYogaConstants(runtime: YogaRuntime): YogaConstants {
  const values = runtime as Record<string, unknown>;
  const flexDirection = objectValue(values.FlexDirection);
  const direction = objectValue(values.Direction);
  const flexWrap = objectValue(values.Wrap);
  const justify = objectValue(values.Justify);
  const align = objectValue(values.Align);
  const edge = objectValue(values.Edge);
  const gutter = objectValue(values.Gutter);
  const display = objectValue(values.Display);
  return {
    row: flexDirection?.Row ?? values.FLEX_DIRECTION_ROW,
    column: flexDirection?.Column ?? values.FLEX_DIRECTION_COLUMN,
    wrap: flexWrap?.Wrap ?? values.WRAP_WRAP,
    nowrap: flexWrap?.NoWrap ?? values.WRAP_NO_WRAP,
    leftToRight: direction?.LTR ?? values.DIRECTION_LTR,
    auto: align?.Auto,
    flexStart: justify?.FlexStart ?? align?.FlexStart,
    center: justify?.Center ?? align?.Center,
    flexEnd: justify?.FlexEnd ?? align?.FlexEnd,
    spaceBetween: justify?.SpaceBetween,
    spaceAround: justify?.SpaceAround,
    spaceEvenly: justify?.SpaceEvenly,
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

function justifyConstant(value: FlexStyle["justifyContent"] | FlexStyle["alignContent"], constants: YogaConstants): unknown {
  if (value === "center") return constants.center ?? "center";
  if (value === "flex-end") return constants.flexEnd ?? "flex-end";
  if (value === "space-between") return constants.spaceBetween ?? "space-between";
  if (value === "space-around") return constants.spaceAround ?? "space-around";
  if (value === "space-evenly") return constants.spaceEvenly ?? "space-evenly";
  return constants.flexStart ?? "flex-start";
}

function alignConstant(value: FlexStyle["alignItems"] | FlexStyle["alignSelf"] | FlexStyle["alignContent"], constants: YogaConstants): unknown {
  if (value === "center") return constants.center ?? "center";
  if (value === "flex-end") return constants.flexEnd ?? "flex-end";
  if (value === "auto") return constants.auto ?? "auto";
  if (value === "stretch" || value === undefined) return constants.stretch ?? "stretch";
  return constants.flexStart ?? "flex-start";
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}
