import { Block, Button, Checkbox, Container, Form, Fragment, Input, List, Modal, Progress, ScrollView, Select, Spinner, Table, Tabs, Text, type NodeProps, type SlateNode } from "./index.js";

export { Fragment };
export { Block, Button, Checkbox, Container, Form, Input, List, Modal, Progress, ScrollView, Select, Spinner, Table, Tabs, Text };

export function jsx(type: typeof Block | typeof Button | typeof Checkbox | typeof Container | typeof Form | typeof Input | typeof List | typeof Modal | typeof Progress | typeof ScrollView | typeof Select | typeof Spinner | typeof Table | typeof Tabs | typeof Text | typeof Fragment, props: NodeProps = {}): SlateNode | SlateNode[] {
  if (type === Fragment) return fragmentChildren(props.children);
  return type(props);
}

export const jsxs = jsx;
export const jsxDEV = jsx;

function fragmentChildren(children: NodeProps["children"]): SlateNode[] {
  const values = Array.isArray(children) ? children : children === undefined ? [] : [children];
  return values.flatMap(value => value && typeof value === "object" && "get" in value && typeof value.get === "function" ? fragmentChildren(value.get() as NodeProps["children"]) : typeof value === "string" || typeof value === "number" ? [Block({ text: String(value) })] : value && typeof value === "object" && "kind" in value ? [value as SlateNode] : []);
}
