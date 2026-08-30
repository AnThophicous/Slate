import { Block, Button, Container, Fragment, type NodeProps, type SlateNode } from "./index.js";

export { Fragment };
export { Block, Button, Container };

export function jsx(type: typeof Block | typeof Button | typeof Container | typeof Fragment, props: NodeProps = {}): SlateNode | SlateNode[] {
  if (type === Fragment) return fragmentChildren(props.children);
  return type(props);
}

export const jsxs = jsx;
export const jsxDEV = jsx;

function fragmentChildren(children: NodeProps["children"]): SlateNode[] {
  const values = Array.isArray(children) ? children : children === undefined ? [] : [children];
  return values.flatMap(value => typeof value === "string" ? [Block({ text: value })] : value ? [value] : []);
}
