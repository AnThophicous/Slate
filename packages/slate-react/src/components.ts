import { Block, Button, Container, Text } from "./vnode.js";
import { Input, List, Modal, readWidgetNumber, readWidgetValue } from "./widgets.js";
import { getTheme, themeColor } from "./theme.js";
import type { BorderSpec, ElementId, EventHandler, FlexDimension, LogLineValue, NodeProps, ReadableSignal, SlateChild, SlateVNode } from "./types.js";

export interface LayoutProps extends Omit<NodeProps, "children"> {
  readonly children?: SlateChild;
  readonly spacing?: FlexDimension;
}

function layout(props: LayoutProps, direction: "row" | "column"): SlateVNode {
  const { children, spacing, style, ...rest } = props;
  return Container({ ...rest, children, style: { flexDirection: direction, gap: spacing ?? 0, ...(style && typeof style === "object" ? style : {}) } });
}

/** Composable vertical layout primitive. */
export function Stack(props: LayoutProps = {}): SlateVNode { return layout(props, "column"); }
/** Composable horizontal layout primitive. */
export function Row(props: LayoutProps = {}): SlateVNode { return layout(props, "row"); }
export function Column(props: LayoutProps = {}): SlateVNode { return Stack(props); }
export function Grid({ columns = 2, gap = 1, children, ...props }: Omit<LayoutProps, "columns"> & { readonly columns?: number }): SlateVNode {
  const count = Math.max(1, Math.trunc(columns));
  // Cells are only named when the grid itself is named. A hard-coded prefix
  // would make two anonymous grids collide on `grid:cell:0`.
  const baseId = props.id === undefined ? undefined : String(props.id);
  const items = (Array.isArray(children) ? children : [children]).map((child, index) => Container({ id: baseId === undefined ? undefined : `${baseId}:cell:${index}`, width: `${100 / count}%`, children: child }));
  return Container({ ...props, children: items, style: { flexWrap: "wrap", flexDirection: "row", gap: gap as FlexDimension, ...(props.style ?? {}) } });
}
export function Spacer(props: Omit<NodeProps, "children"> = {}): SlateVNode { return Block({ ...props, flexGrow: typeof props.flexGrow === "number" ? props.flexGrow : 1 }); }

export interface PanelProps extends Omit<LayoutProps, "title"> { readonly title?: SlateChild; readonly border?: boolean | BorderSpec; }
export function Panel({ title, border = true, children, style, ...props }: PanelProps = {}): SlateVNode {
  // `border: true` follows the theme, so one token restyles every panel.
  const themed = getTheme().border;
  const resolvedBorder = border === true && themed ? { style: themed } : border;
  return Container({ ...props, border: resolvedBorder, children: [title === undefined ? null : Text({ text: String(title), foreground: props.foreground as string | undefined }), children], style: { padding: 1, ...(style && typeof style === "object" ? style : {}) } });
}
export function Card(props: PanelProps = {}): SlateVNode { return Panel({ ...props, background: (props.background as string | undefined) ?? themeColor("surface") }); }
export function Heading({ level = 1, children, ...props }: LayoutProps & { readonly level?: 1 | 2 | 3 }): SlateVNode {
  return Text({ ...props, children, text: String(children ?? ""), foreground: (props.foreground as string | undefined) ?? (level === 1 ? themeColor("heading") : themeColor("subheading")) });
}
export function Badge({ children, background, foreground, ...props }: LayoutProps): SlateVNode {
  return Block({ ...props, background: (background as string | undefined) ?? themeColor("badge"), foreground: (foreground as string | undefined) ?? themeColor("badgeForeground"), children: `[ ${String(children ?? "")} ]` });
}
export function Divider({ direction = "row", foreground, ...props }: NodeProps & { readonly direction?: "row" | "column" }): SlateVNode {
  return Block({ ...props, foreground: (foreground as string | undefined) ?? themeColor("divider"), text: direction === "column" ? "│" : "─", width: direction === "column" ? 1 : props.width as FlexDimension, height: direction === "row" ? 1 : props.height as FlexDimension });
}

export function Field({ label, children, ...props }: LayoutProps & { readonly label: SlateChild; readonly children?: SlateChild }): SlateVNode {
  return Stack({ ...props, children: [Text({ text: String(label ?? ""), foreground: props.foreground as string | undefined }), children] });
}
/**
 * The `id` names the input, because that is the element applications focus and
 * read; the surrounding field gets a derived id so the two never collide.
 */
export function TextField({ label, ...props }: LayoutProps & { readonly label: SlateChild } & Parameters<typeof Input>[0]): SlateVNode {
  const fieldId = props.id === undefined ? undefined : `${String(props.id)}:field`;
  const { value, defaultValue, placeholder, cursor, onChange, onSubmit, focusable, capturePointer, ...field } = props;
  void value; void defaultValue; void placeholder; void cursor; void onChange; void onSubmit; void focusable; void capturePointer;
  return Field({ ...field, id: fieldId, label, children: Input(props) });
}
export function Alert({ children, title, severity = "info", ...props }: PanelProps & { readonly severity?: "info" | "success" | "warning" | "error" }): SlateVNode {
  const tokens = { info: "primary", success: "success", warning: "warning", error: "danger" } as const;
  return Panel({ ...props, title, foreground: props.foreground ?? themeColor(tokens[severity]), children });
}
export function Dialog({ open, title, children, onClose, ...props }: PanelProps & { readonly open: NodeProps["open"]; readonly onClose?: EventHandler }): SlateVNode {
  return Modal({ ...props, open, title: title === undefined ? undefined : String(title), children: Stack({ children: [title === undefined ? null : Heading({ children: String(title) }), children, onClose ? Button({ children: "Close", onPress: onClose }) : null] }) });
}
export function Menu({ items, onChange, ...props }: NodeProps & { readonly items: readonly (string | number)[]; readonly onChange?: NodeProps["onChange"] }): SlateVNode {
  return List({ ...props, items, onChange, focusable: props.focusable ?? true });
}

export interface GaugeProps extends Omit<NodeProps, "children" | "label" | "value"> {
  readonly value?: number | ReadableSignal<number>;
  readonly max?: number;
  readonly label?: SlateChild;
  /** Bar width in cells, excluding the label and the percentage. */
  readonly size?: number;
  readonly color?: string;
  readonly trackColor?: string;
  readonly showValue?: boolean;
  readonly glyphs?: { readonly filled?: string; readonly empty?: string };
}

/**
 * A labelled bar for a bounded quantity. `Progress` draws a bare bar; `Gauge`
 * puts a label, a colored bar and the value on one line.
 */
export function Gauge({ value = 0, max = 1, label, size = 20, color, trackColor, showValue = true, glyphs, ...props }: GaugeProps = {}): SlateVNode {
  const current = readWidgetNumber(value);
  const limit = max === 0 ? 1 : max;
  const ratio = Math.max(0, Math.min(1, current / limit));
  const width = Math.max(1, Math.trunc(size));
  const filledCount = Math.round(width * ratio);
  const filled = (glyphs?.filled ?? "█").repeat(filledCount);
  const empty = (glyphs?.empty ?? "░").repeat(Math.max(0, width - filledCount));
  const baseId = props.id === undefined ? undefined : String(props.id);
  return Row({
    ...props,
    spacing: 1,
    children: [
      label === undefined ? null : Text({ id: derivedId(baseId, "label"), text: String(readWidgetValue(label) ?? "") }),
      // The filled and empty halves are one continuous bar, so they share a row
      // with no gap between them.
      Row({
        id: derivedId(baseId, "bar"),
        children: [
          filled.length === 0 ? null : Text({ id: derivedId(baseId, "filled"), text: filled, foreground: color ?? themeColor("primary") }),
          empty.length === 0 ? null : Text({ id: derivedId(baseId, "track"), text: empty, foreground: trackColor ?? themeColor("muted") })
        ]
      }),
      showValue ? Text({ id: derivedId(baseId, "value"), text: `${Math.round(ratio * 100)}%`, foreground: themeColor("subheading") }) : null
    ]
  });
}

export interface KeyHintItem {
  readonly key: string;
  readonly label: string;
}

export interface KeyHintProps extends Omit<NodeProps, "children"> {
  readonly hints: readonly KeyHintItem[];
  readonly separator?: string;
}

/** The shortcut legend applications usually hand-assemble at the bottom. */
export function KeyHint({ hints, separator = "  ", ...props }: KeyHintProps): SlateVNode {
  const baseId = props.id === undefined ? undefined : String(props.id);
  const children = hints.flatMap((hint, index) => [
    index === 0 ? null : Text({ id: derivedId(baseId, `separator:${index}`), text: separator }),
    Text({ id: derivedId(baseId, `key:${index}`), text: hint.key, foreground: themeColor("primary") }),
    Text({ id: derivedId(baseId, `label:${index}`), text: ` ${hint.label}`, foreground: themeColor("muted") })
  ]);
  return Row({ ...props, children });
}

export interface StatusBarProps extends Omit<NodeProps, "children" | "left" | "right"> {
  readonly left?: SlateChild;
  readonly center?: SlateChild;
  readonly right?: SlateChild;
}

/** One-line bar with left, center and right regions. */
export function StatusBar({ left, center, right, ...props }: StatusBarProps = {}): SlateVNode {
  const baseId = props.id === undefined ? undefined : String(props.id);
  return Row({
    ...props,
    height: (props.height as FlexDimension) ?? 1,
    background: (props.background as string | undefined) ?? themeColor("surface"),
    children: [
      Container({ id: derivedId(baseId, "left"), children: left ?? null }),
      Spacer({ id: derivedId(baseId, "gap:left") }),
      center === undefined ? null : Container({ id: derivedId(baseId, "center"), children: center }),
      center === undefined ? null : Spacer({ id: derivedId(baseId, "gap:right") }),
      Container({ id: derivedId(baseId, "right"), children: right ?? null })
    ]
  });
}

export interface TreeItem {
  readonly id?: ElementId;
  readonly label: string;
  readonly children?: readonly TreeItem[];
  readonly expanded?: boolean;
}

export interface FlatTreeRow {
  readonly item: TreeItem;
  readonly depth: number;
  readonly expandable: boolean;
  readonly expanded: boolean;
  readonly label: string;
}

export interface TreeProps extends Omit<NodeProps, "children" | "items"> {
  readonly nodes: readonly TreeItem[];
  readonly indent?: number;
  readonly glyphs?: { readonly expanded?: string; readonly collapsed?: string; readonly leaf?: string };
}

/**
 * Flattens a tree into the rows a list renders, keeping the collapsed subtrees
 * out. Exported because navigation and selection are indexed by row.
 */
export function flattenTree(nodes: readonly TreeItem[], options: { readonly indent?: number; readonly glyphs?: TreeProps["glyphs"] } = {}): readonly FlatTreeRow[] {
  const indent = Math.max(0, Math.trunc(options.indent ?? 2));
  const expandedGlyph = options.glyphs?.expanded ?? "▾";
  const collapsedGlyph = options.glyphs?.collapsed ?? "▸";
  const leafGlyph = options.glyphs?.leaf ?? " ";
  const rows: FlatTreeRow[] = [];
  const walk = (items: readonly TreeItem[], depth: number): void => {
    for (const item of items) {
      const children = item.children ?? [];
      const expandable = children.length > 0;
      const expanded = expandable && item.expanded !== false;
      rows.push({
        item,
        depth,
        expandable,
        expanded,
        label: `${" ".repeat(depth * indent)}${expandable ? (expanded ? expandedGlyph : collapsedGlyph) : leafGlyph} ${item.label}`
      });
      if (expanded) walk(children, depth + 1);
    }
  };
  walk(nodes, 0);
  return rows;
}

/** Navigable tree built on `List`, so focus and keys behave the same way. */
export function Tree({ nodes, indent = 2, glyphs, ...props }: TreeProps): SlateVNode {
  const rows = flattenTree(nodes, { indent, glyphs });
  return List({ ...props, items: rows.map(row => row.label), focusable: props.focusable ?? true });
}

function derivedId(baseId: string | undefined, suffix: string): ElementId | undefined {
  return baseId === undefined ? undefined : `${baseId}:${suffix}`;
}

export interface LogViewProps extends Omit<NodeProps, "children"> {
  readonly lines: readonly LogLineValue[] | ReadableSignal<readonly LogLineValue[]>;
  readonly follow?: boolean;
}

/** Scrollable log surface with plain, styled and hyperlink-aware lines. */
export function LogView({ lines, follow = true, ...props }: LogViewProps): SlateVNode {
  const value = lines && typeof lines === "object" && "get" in lines ? lines.get() : lines;
  const baseId = props.id === undefined ? undefined : String(props.id);
  const overflow = props.overflow as NodeProps["overflow"] | undefined;
  const scrollTop = props.scrollTop as number | undefined;
  const children = value.map((line, index) => logLine(baseId, line, index));
  return Container({
    ...props,
    overflow: overflow ?? "scroll",
    scrollTop: follow ? Number.MAX_SAFE_INTEGER : scrollTop,
    children
  });
}

function logLine(baseId: string | undefined, value: LogLineValue, index: number): SlateVNode {
  const line = typeof value === "string" ? { text: value } : value;
  const lineId = baseId === undefined ? undefined : line.id ?? `${baseId}:line:${index}`;
  const lineStyle = line.style;
  const runs = line.runs ?? line.spans;
  const children = runs && runs.length > 0
    ? runs.map((run, runIndex) => Text({
      id: lineId === undefined ? undefined : `${String(lineId)}:run:${runIndex}`,
      text: run.text,
      textStyle: run.style,
      link: run.link
    }))
    : [Text({
      id: lineId === undefined ? undefined : `${String(lineId)}:text`,
      text: line.text ?? "",
      textStyle: lineStyle,
      link: line.link
    })];
  return Container({
    id: lineId,
    direction: "row",
    foreground: lineStyle?.foreground,
    background: lineStyle?.background,
    textStyle: lineStyle,
    link: line.link,
    children
  });
}
