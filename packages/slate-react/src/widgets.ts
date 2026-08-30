import { isSignal, readReactive, signal } from "./reactive.js";
import { createElement } from "./vnode.js";
import type { ComponentTreeNode, EventResult, NodeProps, SelectOption, SlateEvent, SlateProps, SlateVNode, WritableSignal } from "./types.js";

export interface InputProps extends Omit<NodeProps, "value" | "onChange"> {
  readonly value?: string | import("./types.js").ReadableSignal<string>;
  readonly onChange?: (value: string, node: ComponentTreeNode) => EventResult | void;
}

export interface SelectProps extends Omit<NodeProps, "selectedIndex" | "onChange" | "options"> {
  readonly options?: readonly SelectOption[];
  readonly selectedIndex?: number | import("./types.js").ReadableSignal<number>;
  readonly onChange?: (value: number, node: ComponentTreeNode) => EventResult | void;
}

export interface CheckboxProps extends Omit<NodeProps, "checked" | "onChange"> {
  readonly checked?: boolean | import("./types.js").ReadableSignal<boolean>;
  readonly onChange?: (value: boolean, node: ComponentTreeNode) => EventResult | void;
}

export interface TabsProps extends Omit<NodeProps, "activeIndex" | "onChange" | "tabs"> {
  readonly tabs?: readonly string[];
  readonly activeIndex?: number | import("./types.js").ReadableSignal<number>;
  readonly onChange?: (value: number, node: ComponentTreeNode) => EventResult | void;
}

export interface ListProps extends Omit<NodeProps, "activeIndex" | "onChange" | "items"> {
  readonly items?: readonly (string | number)[];
  readonly activeIndex?: number | import("./types.js").ReadableSignal<number>;
  readonly onChange?: (value: number, node: ComponentTreeNode) => EventResult | void;
}

export interface GlowProps extends Omit<NodeProps, "effect"> {
  readonly color: string;
  readonly radius?: number;
  readonly intensity?: number;
  readonly speed?: number;
}

export interface ColorShiftProps extends Omit<NodeProps, "effect"> {
  readonly from: string;
  readonly to: string;
  readonly speed?: number;
}

export interface InputController {
  readonly value: WritableSignal<string>;
  readonly cursor: WritableSignal<number>;
  readonly handle: (event: SlateEvent) => EventResult;
}

export interface SelectController {
  readonly selectedIndex: WritableSignal<number>;
  readonly handle: (event: SlateEvent) => EventResult;
}

export interface CheckboxController {
  readonly checked: WritableSignal<boolean>;
  readonly handle: (event: SlateEvent) => EventResult;
}

export interface TabsController {
  readonly activeIndex: WritableSignal<number>;
  readonly handle: (event: SlateEvent) => EventResult;
}

export function Input(props: InputProps = {}): SlateVNode {
  return createElement<SlateProps>("input", { ...props, onChange: props.onChange as NodeProps["onChange"], focusable: (props.focusable as boolean | undefined) ?? true });
}

export function Select(props: SelectProps = {}): SlateVNode {
  return createElement<SlateProps>("select", { ...props, options: props.options ?? [], onChange: props.onChange as NodeProps["onChange"], focusable: (props.focusable as boolean | undefined) ?? true });
}

export function Checkbox(props: CheckboxProps = {}): SlateVNode {
  return createElement<SlateProps>("checkbox", { ...props, onChange: props.onChange as NodeProps["onChange"], focusable: (props.focusable as boolean | undefined) ?? true });
}

export function Tabs(props: TabsProps = {}): SlateVNode {
  return createElement<SlateProps>("tabs", { ...props, tabs: props.tabs ?? [], onChange: props.onChange as NodeProps["onChange"], focusable: (props.focusable as boolean | undefined) ?? true });
}

export function Table(props: NodeProps = {}): SlateVNode {
  return createElement("table", props);
}

export function Spinner(props: NodeProps = {}): SlateVNode {
  return createElement("spinner", props);
}

export function Progress(props: NodeProps = {}): SlateVNode {
  return createElement("progress", props);
}

export function Modal(props: NodeProps = {}): SlateVNode {
  return createElement("modal", props);
}

export function ScrollView(props: NodeProps = {}): SlateVNode {
  return createElement<SlateProps>("scrollView", { ...props, overflow: props.overflow ?? "scroll", focusable: props.focusable ?? true });
}

export function List(props: ListProps = {}): SlateVNode {
  return createElement<SlateProps>("list", { ...props, focusable: (props.focusable as boolean | undefined) ?? true, onChange: props.onChange as NodeProps["onChange"] });
}

export function Form(props: NodeProps = {}): SlateVNode {
  return createElement("form", props);
}

export function Glow(props: GlowProps): SlateVNode {
  return createElement<SlateProps>("glow", { ...props, effect: { kind: "glow", color: props.color, radius: props.radius, intensity: props.intensity, speed: props.speed } });
}

export function ColorShift(props: ColorShiftProps): SlateVNode {
  return createElement<SlateProps>("colorShift", { ...props, effect: { kind: "colorShift", from: props.from, to: props.to, speed: props.speed } });
}

export function createInputController(initial = ""): InputController {
  const value = signal(initial);
  const cursor = signal([...initial].length);
  const setText = (text: string, position: number) => {
    value.set(text);
    cursor.set(Math.max(0, Math.min([...text].length, position)));
  };
  const handle = (event: SlateEvent): EventResult => {
    if (event.kind === "paste" || event.kind === "ime") {
      const insert = event.text ?? "";
      const chars = [...value.peek()];
      const index = cursor.peek();
      chars.splice(index, 0, ...[...insert]);
      setText(chars.join(""), index + [...insert].length);
      return "render";
    }
    if (event.kind !== "key" || (event.code === undefined && event.text === undefined)) return "ignored";
    const code = event.code ?? event.text ?? "";
    const chars = [...value.peek()];
    const index = cursor.peek();
    if (code === "Backspace") {
      if (index === 0) return "consumed";
      chars.splice(index - 1, 1);
      setText(chars.join(""), index - 1);
      return "render";
    }
    if (code === "Delete") {
      if (index >= chars.length) return "consumed";
      chars.splice(index, 1);
      setText(chars.join(""), index);
      return "render";
    }
    if (code === "Left" || code === "ArrowLeft") {
      cursor.set(Math.max(0, index - 1));
      return "render";
    }
    if (code === "Right" || code === "ArrowRight") {
      cursor.set(Math.min(chars.length, index + 1));
      return "render";
    }
    if (code === "Home") {
      cursor.set(0);
      return "render";
    }
    if (code === "End") {
      cursor.set(chars.length);
      return "render";
    }
    if (code.length !== 1 || ((event.modifiers ?? 0) & 6) !== 0) return "ignored";
    chars.splice(index, 0, code);
    setText(chars.join(""), index + 1);
    return "render";
  };
  return { value, cursor, handle };
}

export function createSelectController(options: readonly SelectOption[], initial = 0): SelectController {
  const selectedIndex = signal(normalizeIndex(options, initial, 1));
  const handle = (event: SlateEvent): EventResult => {
    if (event.kind !== "key") return "ignored";
    if (event.code === "Up" || event.code === "ArrowUp" || event.code === "Left" || event.code === "ArrowLeft") {
      selectedIndex.set(findEnabled(options, selectedIndex.peek(), -1));
      return "render";
    }
    if (event.code === "Down" || event.code === "ArrowDown" || event.code === "Right" || event.code === "ArrowRight") {
      selectedIndex.set(findEnabled(options, selectedIndex.peek(), 1));
      return "render";
    }
    return "ignored";
  };
  return { selectedIndex, handle };
}

export function createCheckboxController(initial = false): CheckboxController {
  const checked = signal(initial);
  return {
    checked,
    handle: event => {
      if (event.kind !== "key" || (event.code !== " " && event.code !== "Enter" && event.code !== "Space")) return "ignored";
      checked.update(value => !value);
      return "render";
    }
  };
}

export function createTabsController(count: number, initial = 0): TabsController {
  const activeIndex = signal(Math.max(0, Math.min(Math.max(0, count - 1), initial)));
  return {
    activeIndex,
    handle: event => {
      if (event.kind !== "key" || count < 1) return "ignored";
      if (event.code === "Left" || event.code === "ArrowLeft") activeIndex.set((activeIndex.peek() + count - 1) % count);
      else if (event.code === "Right" || event.code === "ArrowRight") activeIndex.set((activeIndex.peek() + 1) % count);
      else return "ignored";
      return "render";
    }
  };
}

export function widgetText(node: ComponentTreeNode, frameIndex = 0): string[] {
  const props = node.props;
  const value = props.value === undefined ? props.defaultValue : readWidgetValue(props.value);
  if (node.type === "input") return [String(value === undefined || value === "" ? readWidgetValue(props.placeholder) ?? "" : value)];
  if (node.type === "checkbox") return [`[${readWidgetBoolean(props.checked) ? "x" : " "}] ${String(readWidgetValue(props.label) ?? readWidgetValue(props.text) ?? "")}`.trimEnd()];
  if (node.type === "select") {
    const options = Array.isArray(props.options) ? props.options : [];
    const index = Math.max(0, Math.min(options.length - 1, Math.trunc(readWidgetNumber(props.selectedIndex))));
    return [String(options[index]?.label ?? readWidgetValue(props.placeholder) ?? "")];
  }
  if (node.type === "tabs") {
    const tabs = Array.isArray(props.tabs) ? props.tabs : [];
    const active = Math.max(0, Math.min(tabs.length - 1, Math.trunc(readWidgetNumber(props.activeIndex))));
    return [tabs.map((tab, index) => index === active ? `[${tab}]` : ` ${tab} `).join("|")];
  }
  if (node.type === "progress") {
    const progress = Math.max(0, Math.min(1, readWidgetNumber(props.progress)));
    const width = Math.max(4, readWidgetNumber(props.width) || 20);
    const filled = Math.round((width - 2) * progress);
    return [`[${"=".repeat(filled)}${" ".repeat(Math.max(0, width - 2 - filled))}] ${Math.round(progress * 100)}%`];
  }
  if (node.type === "spinner") return [props.spinning !== undefined && readWidgetBoolean(props.spinning) === false ? "" : ["\u28cb", "\u28d9", "\u28f9", "\u28f8", "\u28fc", "\u28f4", "\u2826", "\u2827", "\u2807", "\u280f"][frameIndex % 10] ?? "\u28cb"];
  if (node.type === "list") {
    const items = Array.isArray(props.items) ? props.items : [];
    const active = Math.max(0, Math.min(items.length - 1, Math.trunc(readWidgetNumber(props.activeIndex))));
    return items.map((item, index) => `${index === active ? ">" : " "} ${String(item)}`);
  }
  if (node.type === "table") return tableLines(node);
  if (node.type === "modal") {
    const title = String(readWidgetValue(props.title) ?? "");
    const width = Math.max(4, readWidgetNumber(props.width) || title.length + 4);
    return [`\u250c ${title} \u2510`, "\u2514" + "\u2500".repeat(Math.max(1, width - 2)) + "\u2518"];
  }
  if (node.type === "text" || node.type === "block" || node.type === "button" || node.type === "glow" || node.type === "colorShift") return [String(node.type === "button" ? readWidgetValue(props.label) ?? readWidgetValue(props.text) ?? "" : readWidgetValue(props.text) ?? readWidgetValue(props.label) ?? readWidgetValue(props.placeholder) ?? "")];
  return [];
}

export function readWidgetValue(value: unknown): unknown {
  return isSignal(value) ? readReactive(value) : value;
}

export function readWidgetBoolean(value: unknown): boolean {
  return Boolean(readWidgetValue(value));
}

export function readWidgetNumber(value: unknown): number {
  const result = Number(readWidgetValue(value));
  return Number.isFinite(result) ? result : 0;
}

function tableLines(node: ComponentTreeNode): string[] {
  const rows = Array.isArray(node.props.rows) ? node.props.rows : [];
  const columns = Array.isArray(node.props.columns) ? node.props.columns : [];
  if (columns.length === 0) return rows.map(row => Array.isArray(row) ? row.join(" | ") : Object.values(row).join(" | "));
  const header = columns.map(column => column.title ?? column.key);
  const values = rows.map(row => columns.map(column => Array.isArray(row) ? String(row[columns.indexOf(column)] ?? "") : String(row[column.key] ?? "")));
  return [header, ...values].map(row => row.join(" | "));
}

function normalizeIndex(options: readonly SelectOption[], value: number, direction: 1 | -1): number {
  if (options.length === 0) return 0;
  return options[value]?.disabled ? findEnabled(options, value, direction) : Math.max(0, Math.min(options.length - 1, value));
}

function findEnabled(options: readonly SelectOption[], current: number, direction: 1 | -1): number {
  if (options.length === 0) return 0;
  for (let step = 1; step <= options.length; step += 1) {
    const index = (current + direction * step + options.length * 2) % options.length;
    if (!options[index]?.disabled) return index;
  }
  return current;
}
