import { Block, Button, Container, Fragment, Text, jsx as createJsx, jsxDEV as createJsxDev, jsxs as createJsxs } from "./vnode.js";
import { Checkbox, ColorShift, Form, Glow, Input, List, Modal, Progress, ScrollView, Select, Spinner, Table, Tabs } from "./widgets.js";
import type { SlateChild, SlateProps, SlateVNode } from "./types.js";

export { Block, Button, Checkbox, ColorShift, Container, Form, Fragment, Glow, Input, List, Modal, Progress, ScrollView, Select, Spinner, Table, Tabs, Text };
export const jsx = createJsx;
export const jsxs = createJsxs;
export const jsxDEV = createJsxDev;

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
    input: SlateProps;
    select: SlateProps;
    checkbox: SlateProps;
    tabs: SlateProps;
    table: SlateProps;
    spinner: SlateProps;
    progress: SlateProps;
    modal: SlateProps;
    scrollView: SlateProps;
    list: SlateProps;
    form: SlateProps;
    glow: SlateProps;
    colorShift: SlateProps;
    [name: string]: SlateProps;
  }
  export type ElementType = string | ((props: never) => SlateChild);
}
