import { Row } from "./components.js";
import { ExpressiveButton, createExpressiveInteraction } from "./material-expressive.js";
import { Image, Media, Video, readWidgetBoolean } from "./widgets.js";
import { Container, Text, createElement } from "./vnode.js";
import { themeColor } from "./theme.js";
import type {
  BorderSpec,
  EffectSpec,
  ElementId,
  EventHandler,
  FlexDimension,
  MediaProtocol,
  NodeProps,
  SignalValue,
  SlateChild,
  SlateVNode
} from "./types.js";

/** Border names map to the four border glyph families already in Slate. */
export type MosaicBorder = "square" | "rounded" | "double" | "heavy";
export type MosaicVariant = "default" | "tonal" | "accent" | "muted" | "expressive";
export type MosaicBorderInput = boolean | BorderSpec | MosaicBorder;

export interface MosaicProps extends Omit<NodeProps, "children" | "border" | "columns"> {
  readonly children?: SlateChild;
  /** Number of columns. A value of two gives the default 2-column gallery. */
  readonly columns?: number;
  readonly gap?: FlexDimension;
  readonly border?: MosaicBorderInput;
  readonly shape?: MosaicBorder;
}

export interface MosaicItemProps extends Omit<NodeProps, "children" | "label" | "border" | "onPress" | "onHover" | "disabled" | "focusable" | "capturePointer" | "effect" | "source" | "media" | "frames" | "mimeType" | "alt" | "protocol"> {
  readonly children?: SlateChild;
  readonly image?: NodeProps["source"];
  readonly media?: NodeProps["media"];
  readonly frames?: NodeProps["frames"];
  readonly mimeType?: string;
  readonly alt?: SignalValue<string>;
  readonly protocol?: MediaProtocol;
  readonly label?: SignalValue<string>;
  readonly description?: SignalValue<string>;
  readonly onPress?: EventHandler;
  readonly onHover?: EventHandler;
  readonly disabled?: boolean;
  readonly focusable?: boolean;
  readonly capturePointer?: boolean;
  readonly selected?: SignalValue<boolean>;
  /** Optional stable interaction state for a MosaicItem rebuilt by a view function. */
  readonly interaction?: import("./material-expressive.js").ExpressiveInteraction;
  readonly border?: MosaicBorderInput;
  readonly shape?: MosaicBorder;
  readonly effect?: SignalValue<EffectSpec>;
  readonly variant?: MosaicVariant;
}

/**
 * A configurable gallery. Rows are generated from `columns`; four items are
 * only one possible composition, not a hidden limit in the component.
 */
export function Mosaic({ children, columns = 2, gap = 1, border, shape, ...props }: MosaicProps = {}): SlateVNode {
  const count = normalizeColumns(columns);
  const baseId = props.id === undefined ? undefined : String(props.id);
  const items = childList(children);
  const rows: SlateChild[] = [];
  for (let offset = 0; offset < items.length; offset += count) {
    const rowItems = items.slice(offset, offset + count).map((child, index) => {
      const absoluteIndex = offset + index;
      return Container({
        id: derivedId(baseId, `slot:${absoluteIndex}`),
        flexGrow: 1,
        flexBasis: 0,
        minWidth: 0,
        children: withDerivedId(child, derivedId(baseId, `item:${absoluteIndex}`))
      });
    });
    rows.push(Row({
      id: derivedId(baseId, `row:${offset / count}`),
      spacing: gap,
      alignItems: "stretch",
      children: rowItems
    }));
  }
  return Container({
    ...props,
    direction: "column",
    gap,
    border: resolveBorder(shape, border),
    children: rows
  });
}

/** A gallery tile with optional terminal media, label, description and effect. */
export function MosaicItem(props: MosaicItemProps = {}): SlateVNode {
  const interaction = props.interaction ?? createExpressiveInteraction();
  // `MosaicItemProps` intentionally widens `border` with shape aliases; the
  // runtime VNode still enters Slate through the normal NodeProps boundary.
  return createElement<MosaicItemProps>(resolveMosaicItem, { ...props, interaction }) as unknown as SlateVNode;
}

function resolveMosaicItem({
  id,
  children,
  image,
  media,
  frames,
  mimeType,
  alt,
  protocol,
  label,
  description,
  selected,
  variant = "default",
  border,
  shape,
  effect,
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
}: MosaicItemProps = {}): SlateVNode {
  const isSelected = readWidgetBoolean(selected);
  const visual = visualStyle(variant, isSelected, disabled === true);
  const mediaNode = image !== undefined
    ? Image({ id: derivedId(id, "media"), source: image, mimeType, alt: alt ?? "image", protocol })
    : frames !== undefined
      ? Video({ id: derivedId(id, "media"), source: media, frames, mimeType, alt: alt ?? "video", protocol })
      : media !== undefined
        ? Media({ id: derivedId(id, "media"), media, mimeType, alt: alt ?? "media", protocol })
        : null;
  const content = Container({
    id: derivedId(id, "content"),
    children: [
      mediaNode,
      label === undefined ? null : Text({ id: derivedId(id, "label"), text: label }),
      description === undefined ? null : Text({ id: derivedId(id, "description"), text: description, textStyle: { dim: true } }),
      children === undefined ? null : children
    ]
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
    role: variant === "expressive" ? "tertiary" : variant === "tonal" ? "secondary" : "primary",
    background: background ?? visual.background,
    foreground: foreground ?? visual.foreground,
    textStyle: isSelected ? { bold: true, ...(textStyle ?? {}) } : textStyle,
    border: resolveItemBorder(shape, border, isSelected, variant),
    effect,
    children: content
  });
}

function visualStyle(variant: MosaicVariant, selected: boolean, disabled: boolean): { readonly background: string; readonly foreground: string } {
  if (disabled) return { background: themeColor("surface"), foreground: themeColor("muted") };
  if (selected) return { background: themeColor("primary"), foreground: themeColor("background") };
  if (variant === "accent") return { background: themeColor("primary"), foreground: themeColor("background") };
  if (variant === "muted") return { background: themeColor("background"), foreground: themeColor("muted") };
  if (variant === "tonal") return { background: themeColor("surface"), foreground: themeColor("subheading") };
  if (variant === "expressive") return { background: themeColor("surface"), foreground: themeColor("primary") };
  return { background: themeColor("surface"), foreground: themeColor("foreground") };
}

function resolveItemBorder(shape: MosaicBorder | undefined, border: MosaicBorderInput | undefined, selected: boolean, variant: MosaicVariant): boolean | BorderSpec | undefined {
  if (border === false) return false;
  if (shape !== undefined) return shapeToBorder(shape, border);
  if (typeof border === "string") return shapeToBorder(border, undefined);
  if (border !== undefined) return border;
  if (selected) return { style: "rounded", color: themeColor("primary") };
  if (variant === "expressive") return { style: "double", color: themeColor("primary") };
  return undefined;
}

function resolveBorder(shape: MosaicBorder | undefined, border: MosaicBorderInput | undefined): boolean | BorderSpec | undefined {
  if (border === false) return false;
  if (shape !== undefined) return shapeToBorder(shape, border);
  if (typeof border === "string") return shapeToBorder(border, undefined);
  return border;
}

function shapeToBorder(shape: MosaicBorder, border: MosaicBorderInput | undefined): BorderSpec {
  const base = border && typeof border === "object" ? border : {};
  return { ...base, style: shape === "square" ? "single" : shape };
}

function normalizeColumns(value: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.trunc(number)) : 2;
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
