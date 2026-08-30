import type { SlateChild, SlateProps, SlateVNode } from "./types.js";
import { Fragment, jsx, jsxs, jsxDEV } from "./vnode.js";

export { Fragment, jsx, jsxs, jsxDEV };

export namespace JSX {
  export type Element = SlateVNode;
  export interface ElementChildrenAttribute {
    children: {};
  }
  export interface IntrinsicElements {
    container: SlateProps;
    block: SlateProps;
    button: SlateProps;
    text: SlateProps;
    [name: string]: SlateProps;
  }
  export type ElementType = string | ((props: never) => SlateChild);
}
