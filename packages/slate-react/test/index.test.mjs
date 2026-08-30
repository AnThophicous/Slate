import test from "node:test";
import assert from "node:assert/strict";
import {
  Block,
  Button,
  Container,
  Fragment,
  createFlexLayoutEngine,
  createReactAdapter,
  createSlateHooks,
  createSlateRoot,
  createSlateStore,
  jsx,
  reconcile,
  resolveTree
} from "../dist/index.js";

test("cria e resolve uma árvore JSX com IDs", () => {
  const tree = resolveTree(jsx(Container, {
    id: "app",
    children: [jsx(Block, { id: "title", text: "Slate" }), jsx(Button, { id: "send", children: "Enviar" })]
  }));
  assert.equal(tree?.id, "app");
  assert.deepEqual(tree?.children.map(child => child.id), ["title", "send"]);
  assert.equal(tree?.children[1]?.children[0]?.props.text, "Enviar");
});

test("reconcilia atualização, remoção, inserção e movimento por key", () => {
  const previous = resolveTree(jsx(Container, { id: "app", children: [
    jsx(Block, { key: "a", text: "A" }),
    jsx(Block, { key: "b", text: "B" })
  ] }));
  const next = resolveTree(jsx(Container, { id: "app", children: [
    jsx(Block, { key: "b", text: "B2" }),
    jsx(Block, { key: "c", text: "C" })
  ] }));
  const operations = reconcile(previous, next);
  assert.ok(operations.some(operation => operation.type === "move"));
  assert.ok(operations.some(operation => operation.type === "update"));
  assert.ok(operations.some(operation => operation.type === "insert"));
  assert.ok(operations.some(operation => operation.type === "remove"));
});

test("SlateRoot publica operações e mantém a árvore atual", () => {
  const root = createSlateRoot();
  let notifications = 0;
  const unsubscribe = root.subscribe(() => { notifications += 1; });
  assert.equal(root.render(Block({ id: "message", text: "um" })).length, 1);
  assert.equal(root.render(Block({ id: "message", text: "dois" })).length, 1);
  unsubscribe();
  assert.equal(notifications, 2);
  assert.equal(root.getTree()?.props.text, "dois");
});

test("store e hooks usam snapshot externo sem dependência de React", () => {
  const store = createSlateStore(1);
  let updates = 0;
  store.subscribe(() => { updates += 1; });
  store.update(value => value + 1);
  assert.equal(store.get(), 2);
  assert.equal(updates, 1);
  const hooks = createSlateHooks({
    useState: initial => [typeof initial === "function" ? initial() : initial, () => {}],
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot()
  });
  assert.equal(hooks.useSlateStore(store), 2);
});

test("adapter React opcional converte host types sem importar React", () => {
  const runtime = {
    Fragment: "Fragment",
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: initial => [typeof initial === "function" ? initial() : initial, () => {}]
  };
  const adapter = createReactAdapter(runtime);
  const result = adapter.toReact(jsx(Container, { id: "app", children: "Olá" }));
  assert.equal(result.type, "container");
  assert.equal(result.children[0], "Olá");
});

test("layout flex portátil posiciona filhos em row", () => {
  const tree = resolveTree(jsx(Container, { id: "app", style: { flexDirection: "row", gap: 1 }, children: [
    jsx(Block, { id: "a", text: "A" }),
    jsx(Block, { id: "b", text: "B" })
  ] }));
  assert.ok(tree);
  const layout = createFlexLayoutEngine().layout(tree, { width: 10, height: 2 });
  assert.equal(layout.children[0]?.layout.x, 0);
  assert.equal(layout.children[1]?.layout.x, 2);
});

test("fragmentos são achatados para a árvore de componentes", () => {
  const tree = resolveTree(jsx(Fragment, { children: [Block({ id: "a" }), Block({ id: "b" })] }));
  assert.equal(tree?.type, "fragment");
  assert.deepEqual(tree?.children.map(child => child.id), ["a", "b"]);
});
