export type ElementId = string | number;
export type Key = string | number;
export type FlexDimension = number | `${number}%` | "auto";
export type FlexDirection = "row" | "column";
export type FlexWrap = "nowrap" | "wrap" | "wrap-reverse";
export type JustifyContent = "flex-start" | "center" | "flex-end" | "space-between" | "space-around" | "space-evenly";
export type AlignItems = "stretch" | "flex-start" | "center" | "flex-end";
export type AlignSelf = "auto" | "stretch" | "flex-start" | "center" | "flex-end";
export type Overflow = "visible" | "hidden" | "scroll" | "auto";
export type EventResult = "ignored" | "consumed" | "render" | "exit";
export type KeyPhase = "press" | "repeat" | "release";

export interface ReadableSignal<T> {
  readonly __slateSignal: true;
  readonly get: () => T;
  readonly peek: () => T;
  readonly subscribe: (listener: () => void) => () => void;
}

export interface WritableSignal<T> extends ReadableSignal<T> {
  readonly set: (value: T | ((previous: T) => T)) => void;
  readonly update: (value: T | ((previous: T) => T)) => void;
}

export type SignalValue<T> = T | ReadableSignal<T>;

export interface FlexStyle {
  readonly display?: "flex" | "none";
  readonly flexDirection?: FlexDirection;
  readonly flexWrap?: FlexWrap;
  readonly flexGrow?: number;
  readonly flexShrink?: number;
  readonly flexBasis?: FlexDimension;
  readonly width?: FlexDimension;
  readonly height?: FlexDimension;
  readonly minWidth?: FlexDimension;
  readonly maxWidth?: FlexDimension;
  readonly minHeight?: FlexDimension;
  readonly maxHeight?: FlexDimension;
  readonly gap?: FlexDimension;
  readonly rowGap?: FlexDimension;
  readonly columnGap?: FlexDimension;
  readonly padding?: FlexDimension;
  readonly paddingTop?: FlexDimension;
  readonly paddingRight?: FlexDimension;
  readonly paddingBottom?: FlexDimension;
  readonly paddingLeft?: FlexDimension;
  readonly margin?: FlexDimension;
  readonly marginTop?: FlexDimension;
  readonly marginRight?: FlexDimension;
  readonly marginBottom?: FlexDimension;
  readonly marginLeft?: FlexDimension;
  readonly justifyContent?: JustifyContent;
  readonly alignItems?: AlignItems;
  readonly alignContent?: AlignItems | "space-between" | "space-around" | "space-evenly";
  readonly alignSelf?: AlignSelf;
  readonly position?: "relative" | "absolute";
  readonly overflow?: Overflow;
  readonly overflowX?: Overflow;
  readonly overflowY?: Overflow;
  readonly scrollLeft?: number;
  readonly scrollTop?: number;
  readonly top?: FlexDimension;
  readonly right?: FlexDimension;
  readonly bottom?: FlexDimension;
  readonly left?: FlexDimension;
}

export interface GlowEffect {
  readonly kind: "glow";
  readonly color: string;
  readonly radius?: number;
  readonly intensity?: number;
  readonly speed?: number;
}

export interface ColorShiftEffect {
  readonly kind: "colorShift";
  readonly from: string;
  readonly to: string;
  readonly speed?: number;
}

export type EffectSpec = GlowEffect | ColorShiftEffect;

export interface SlateEvent {
  readonly kind: "key" | "mouse" | "resize" | "paste" | "focusGained" | "focusLost" | "ime";
  readonly code?: string;
  readonly text?: string;
  readonly phase?: KeyPhase;
  readonly modifiers?: number;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly action?: "press" | "release" | "drag" | "move" | "scroll";
  readonly button?: "left" | "right" | "middle" | "other";
  readonly deltaX?: number;
  readonly deltaY?: number;
}

export interface SelectOption {
  readonly label: string;
  readonly value?: string;
  readonly disabled?: boolean;
}

export interface TableColumn {
  readonly key: string;
  readonly title?: string;
  readonly width?: number | `${number}%`;
}

export interface NodeProps {
  readonly id?: ElementId;
  readonly key?: Key;
  readonly x?: number;
  readonly y?: number;
  readonly children?: SlateChild;
  readonly style?: FlexStyle;
  readonly direction?: FlexDirection;
  readonly wrap?: FlexWrap;
  readonly gap?: FlexDimension;
  readonly rowGap?: FlexDimension;
  readonly columnGap?: FlexDimension;
  readonly flexGrow?: number;
  readonly flexShrink?: number;
  readonly flexBasis?: FlexDimension;
  readonly width?: FlexDimension;
  readonly height?: FlexDimension;
  readonly minWidth?: FlexDimension;
  readonly maxWidth?: FlexDimension;
  readonly minHeight?: FlexDimension;
  readonly maxHeight?: FlexDimension;
  readonly justifyContent?: JustifyContent;
  readonly alignItems?: AlignItems;
  readonly alignContent?: AlignItems | "space-between" | "space-around" | "space-evenly";
  readonly alignSelf?: AlignSelf;
  readonly padding?: FlexDimension;
  readonly paddingTop?: FlexDimension;
  readonly paddingRight?: FlexDimension;
  readonly paddingBottom?: FlexDimension;
  readonly paddingLeft?: FlexDimension;
  readonly margin?: FlexDimension;
  readonly marginTop?: FlexDimension;
  readonly marginRight?: FlexDimension;
  readonly marginBottom?: FlexDimension;
  readonly marginLeft?: FlexDimension;
  readonly position?: "relative" | "absolute";
  readonly top?: FlexDimension;
  readonly right?: FlexDimension;
  readonly bottom?: FlexDimension;
  readonly left?: FlexDimension;
  readonly overflow?: Overflow;
  readonly overflowX?: Overflow;
  readonly overflowY?: Overflow;
  readonly scrollLeft?: number;
  readonly scrollTop?: number;
  readonly visible?: boolean;
  readonly focusable?: boolean;
  readonly foreground?: string;
  readonly background?: string;
  readonly text?: SignalValue<string>;
  readonly placeholder?: SignalValue<string>;
  readonly label?: SignalValue<string>;
  readonly value?: SignalValue<string | number | boolean>;
  readonly defaultValue?: string | number | boolean;
  readonly options?: readonly SelectOption[];
  readonly selectedIndex?: SignalValue<number>;
  readonly checked?: SignalValue<boolean>;
  readonly activeIndex?: SignalValue<number>;
  readonly tabs?: readonly string[];
  readonly rows?: readonly (readonly (string | number)[] | Record<string, string | number>)[];
  readonly columns?: readonly TableColumn[];
  readonly items?: readonly (string | number)[];
  readonly progress?: SignalValue<number>;
  readonly spinning?: SignalValue<boolean>;
  readonly open?: SignalValue<boolean>;
  readonly title?: SignalValue<string>;
  readonly cursor?: SignalValue<number>;
  readonly effect?: SignalValue<EffectSpec>;
  readonly onEvent?: EventHandler;
  readonly onKey?: EventHandler;
  readonly onMouse?: EventHandler;
  readonly onPaste?: EventHandler;
  readonly onResize?: EventHandler;
  readonly onIme?: EventHandler;
  readonly onPress?: EventHandler;
  readonly onChange?: (value: string | number | boolean, node: ComponentTreeNode) => EventResult | void;
  readonly onSubmit?: (value: string, node: ComponentTreeNode) => EventResult | void;
  readonly onFocus?: (node: ComponentTreeNode) => EventResult | void;
  readonly onBlur?: (node: ComponentTreeNode) => EventResult | void;
  readonly onScroll?: (x: number, y: number, node: ComponentTreeNode) => EventResult | void;
  readonly [property: string]: unknown;
}

export type SlateProps = NodeProps;

export type EventHandler = (event: SlateEvent, node: ComponentTreeNode) => EventResult | void;
export type SlateChild = SlateVNode | string | number | boolean | null | undefined | ReadableSignal<unknown> | readonly SlateChild[];
export type SlateComponent<P extends object = SlateProps> = (props: P) => SlateChild;
export type HostType = "container" | "block" | "button" | "text" | "input" | "select" | "checkbox" | "tabs" | "table" | "spinner" | "progress" | "modal" | "scrollView" | "list" | "form" | "glow" | "colorShift" | "fragment" | (string & {});
export type SlateElementType<P extends object = SlateProps> = HostType | SlateComponent<P> | symbol;

export interface SlateVNode<P extends object = SlateProps> {
  readonly $$typeof: symbol;
  readonly type: SlateElementType<P>;
  readonly key: Key | null;
  readonly props: P;
}

export type ResolvedProps = Readonly<Record<string, unknown>>;

export interface ComponentTreeNode {
  readonly id: ElementId;
  readonly key: Key | null;
  readonly type: HostType;
  readonly props: ResolvedProps;
  readonly children: readonly ComponentTreeNode[];
}
