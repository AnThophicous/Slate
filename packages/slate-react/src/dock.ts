import { Row } from "./components.js";
import { ExpressiveButton, createExpressiveInteraction } from "./material-expressive.js";
import { readWidgetBoolean } from "./widgets.js";
import { Container, Text, createElement } from "./vnode.js";
import { themeColor } from "./theme.js";
import type {
  BorderSpec,
  ElementId,
  EventHandler,
  FlexDimension,
  NodeProps,
  SignalValue,
  SlateChild,
  SlateVNode
} from "./types.js";

/** Border shape aliases used by the higher-level expressive components. */
export type DockShape = "square" | "rounded" | "double" | "heavy";

export interface DockProps extends Omit<NodeProps, "children" | "border" | "items"> {
  readonly children?: SlateChild;
  /** Convenience data API; `children` remains available for custom content. */
  readonly items?: readonly DockItemProps[];
  readonly spacing?: FlexDimension;
  readonly border?: boolean | BorderSpec;
  readonly shape?: DockShape;
}

export interface DockItemProps extends Omit<NodeProps, "children" | "label" | "border" | "onPress" | "onHover" | "disabled" | "focusable" | "capturePointer"> {
  readonly children?: SlateChild;
  readonly icon?: SlateChild;
  readonly label?: SignalValue<string>;
  readonly onPress?: EventHandler;
  readonly onHover?: EventHandler;
  readonly disabled?: boolean;
  readonly focusable?: boolean;
  readonly capturePointer?: boolean;
  readonly active?: SignalValue<boolean>;
  /** Optional stable interaction state for a DockItem rebuilt by a view function. */
  readonly interaction?: import("./material-expressive.js").ExpressiveInteraction;
  readonly border?: boolean | BorderSpec;
  readonly shape?: DockShape;
}

/**
 * A horizontal, keyboard and mouse navigable dock.
 *
 * The dock does not own selection state. Applications can drive `active` with
 * a signal and use `onPress` to change that signal, which keeps the component
 * composable with the rest of Slate's reactive tree.
 */
export function Dock({ children, items, spacing = 1, shape, border, background, ...props }: DockProps = {}): SlateVNode {
  const baseId = props.id === undefined ? undefined : String(props.id);
  const itemNodes: SlateChild[] = [];
  for (const [index, item] of (items ?? []).entries()) {
    itemNodes.push(DockItem({ ...item, id: item.id ?? derivedId(baseId, `item:${index}`) }));
  }
  const customChildren = childList(children).map((child, index) => withDerivedId(child, derivedId(baseId, `item:${itemNodes.length + index}`)));
  return Row({
    ...props,
    background: background ?? themeColor("surface"),
    border: resolveBorder(shape, border),
    spacing,
    children: [...itemNodes, ...customChildren]
  });
}

/** A single dock item backed by Slate's real `Button` widget. */
export function DockItem(props: DockItemProps = {}): SlateVNode {
  const interaction = props.interaction ?? createExpressiveInteraction();
  return createElement<DockItemProps>(resolveDockItem, { ...props, interaction });
}

function resolveDockItem({
  id,
  icon,
  label,
  children,
  active,
  shape,
  border,
  background,
  foreground,
  textStyle,
  disabled,
  focusable,
  capturePointer,
  onPress,
  onHover,
  interaction,
  ...props
}: DockItemProps = {}): SlateVNode {
  const isActive = readWidgetBoolean(active);
  const body = Container({
    id: derivedId(id, "content"),
    children: Row({
      id: derivedId(id, "label"),
      spacing: 1,
      alignItems: "center",
      children: [
        icon === undefined ? null : icon,
        label === undefined ? null : Text({ id: derivedId(id, "text"), text: label }),
        children === undefined ? null : children
      ]
    })
  });
  return ExpressiveButton({
    ...props,
    id,
    disabled,
    focusable: focusable ?? true,
    capturePointer: capturePointer ?? true,
    onPress,
    onHover,
    interaction,
    background: background ?? (isActive ? themeColor("primary") : undefined),
    foreground: foreground ?? (disabled ? themeColor("muted") : isActive ? themeColor("background") : themeColor("foreground")),
    textStyle: isActive ? { bold: true, ...(textStyle ?? {}) } : textStyle,
    border: resolveBorder(shape, border),
    children: body
  });
}

function resolveBorder(shape: DockShape | undefined, border: boolean | BorderSpec | undefined): boolean | BorderSpec | undefined {
  if (border === false) return false;
  if (shape === undefined) return border;
  const base = border && typeof border === "object" ? border : {};
  return { ...base, style: shape === "square" ? "single" : shape };
}

function derivedId(baseId: ElementId | undefined, suffix: string): ElementId | undefined {
  return baseId === undefined ? undefined : `${String(baseId)}:${suffix}`;
}

function childList(value: SlateChild | undefined): SlateChild[] {
  const result: SlateChild[] = [];
  const append = (child: SlateChild): void => {
    if (Array.isArray(child)) {
      for (const nested of child) append(nested);
      return;
    }
    result.push(child);
  };
  if (value !== undefined) append(value);
  return result;
}

function withDerivedId(value: SlateChild, id: ElementId | undefined): SlateChild {
  if (id === undefined || !isSlateVNode(value) || value.props.id !== undefined) return value;
  if (value.type !== "button" && typeof value.type !== "function") return value;
  return { ...value, props: { ...value.props, id } };
}

function isSlateVNode(value: SlateChild): value is SlateVNode {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && "$$typeof" in value
    && "type" in value
    && "props" in value;
}
