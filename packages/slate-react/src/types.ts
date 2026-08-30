export type ElementId = string | number;
export type Key = string | number;
export type FlexDimension = number | "auto";

export interface FlexStyle {
  readonly display?: "flex" | "none";
  readonly flexDirection?: "row" | "column";
  readonly flexGrow?: number;
  readonly flexShrink?: number;
  readonly flexBasis?: FlexDimension;
  readonly width?: FlexDimension;
  readonly height?: FlexDimension;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly minHeight?: number;
  readonly maxHeight?: number;
  readonly gap?: number;
  readonly rowGap?: number;
  readonly columnGap?: number;
  readonly padding?: number;
  readonly paddingTop?: number;
  readonly paddingRight?: number;
  readonly paddingBottom?: number;
  readonly paddingLeft?: number;
  readonly margin?: number;
  readonly marginTop?: number;
  readonly marginRight?: number;
  readonly marginBottom?: number;
  readonly marginLeft?: number;
  readonly justifyContent?: "flex-start" | "center" | "flex-end" | "space-between" | "space-around";
  readonly alignItems?: "stretch" | "flex-start" | "center" | "flex-end";
  readonly alignSelf?: "auto" | "stretch" | "flex-start" | "center" | "flex-end";
}

export interface SlateProps {
  readonly id?: ElementId;
  readonly key?: Key;
  readonly children?: SlateChild;
  readonly style?: FlexStyle;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly visible?: boolean;
  readonly focusable?: boolean;
  readonly text?: string;
  readonly label?: string;
  readonly [property: string]: unknown;
}

export type SlateChild = SlateVNode | string | number | boolean | null | undefined | readonly SlateChild[];
export type SlateComponent<P extends object = SlateProps> = (props: P) => SlateChild;
export type HostType = "container" | "block" | "button" | "text" | "fragment" | (string & {});
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
