import { Block, Button, Container, Text } from "./vnode.js";
import { Input, List, Modal } from "./widgets.js";
import type { BorderSpec, EventHandler, FlexDimension, LogLineValue, NodeProps, ReadableSignal, SlateChild, SlateVNode } from "./types.js";

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
export function Grid({ columns = 2, gap = 1, children, ...props }: LayoutProps & { readonly columns?: number }): SlateVNode {
  const count = Math.max(1, Math.trunc(columns));
  const items = (Array.isArray(children) ? children : [children]).map((child, index) => Container({ id: `${String(props.id ?? "grid")}:cell:${index}`, width: `${100 / count}%`, children: child }));
  return Container({ ...props, children: items, style: { flexWrap: "wrap", flexDirection: "row", gap: gap as FlexDimension, ...(props.style ?? {}) } });
}
export function Spacer(props: Omit<NodeProps, "children"> = {}): SlateVNode { return Block({ ...props, flexGrow: typeof props.flexGrow === "number" ? props.flexGrow : 1 }); }

export interface PanelProps extends LayoutProps { readonly title?: SlateChild; readonly border?: boolean | BorderSpec; }
export function Panel({ title, border = true, children, style, ...props }: PanelProps = {}): SlateVNode {
  return Container({ ...props, border, children: [title === undefined ? null : Text({ text: String(title), foreground: props.foreground as string | undefined }), children], style: { padding: 1, ...(style && typeof style === "object" ? style : {}) } });
}
export function Card(props: PanelProps = {}): SlateVNode { return Panel({ ...props, background: (props.background as string | undefined) ?? "#151a24" }); }
export function Heading({ level = 1, children, ...props }: LayoutProps & { readonly level?: 1 | 2 | 3 }): SlateVNode {
  return Text({ ...props, children, text: String(children ?? ""), foreground: (props.foreground as string | undefined) ?? (level === 1 ? "#ffffff" : "#cbd5e1") });
}
export function Badge({ children, background = "#334155", foreground = "#ffffff", ...props }: LayoutProps): SlateVNode {
  return Block({ ...props, background: background as string, foreground: foreground as string, children: `[ ${String(children ?? "")} ]` });
}
export function Divider({ direction = "row", foreground = "#475569", ...props }: NodeProps & { readonly direction?: "row" | "column" }): SlateVNode {
  return Block({ ...props, foreground: foreground as string, text: direction === "column" ? "│" : "─", width: direction === "column" ? 1 : props.width as FlexDimension, height: direction === "row" ? 1 : props.height as FlexDimension });
}

export function Field({ label, children, ...props }: LayoutProps & { readonly label: SlateChild; readonly children?: SlateChild }): SlateVNode {
  return Stack({ ...props, children: [Text({ text: String(label ?? ""), foreground: props.foreground as string | undefined }), children] });
}
export function TextField({ label, ...props }: LayoutProps & { readonly label: SlateChild } & Parameters<typeof Input>[0]): SlateVNode {
  return Field({ label, ...props, children: Input(props) });
}
export function Alert({ children, title, severity = "info", ...props }: PanelProps & { readonly severity?: "info" | "success" | "warning" | "error" }): SlateVNode {
  const colors = { info: "#38bdf8", success: "#4ade80", warning: "#facc15", error: "#fb7185" };
  return Panel({ ...props, title, foreground: props.foreground ?? colors[severity], children });
}
export function Dialog({ open, title, children, onClose, ...props }: PanelProps & { readonly open: NodeProps["open"]; readonly onClose?: EventHandler }): SlateVNode {
  return Modal({ ...props, open, title: title === undefined ? undefined : String(title), children: Stack({ children: [title === undefined ? null : Heading({ children: String(title) }), children, onClose ? Button({ children: "Close", onPress: onClose }) : null] }) });
}
export function Menu({ items, onChange, ...props }: NodeProps & { readonly items: readonly (string | number)[]; readonly onChange?: NodeProps["onChange"] }): SlateVNode {
  return List({ ...props, items, onChange, focusable: props.focusable ?? true });
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
