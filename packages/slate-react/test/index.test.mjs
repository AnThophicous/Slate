import test from "node:test";
import assert from "node:assert/strict";
import {
  Block,
  Button,
  Container,
  Fragment,
  createFlexLayoutEngine,
  createReactAdapter,
  createSlateApp,
  createInputRouter,
  createTerminalController,
  createSlateHooks,
  createSlateRoot,
  createSlateStore,
  computed,
  effect,
  hitTest,
  render,
  Input,
  Checkbox,
  ColorShift,
  Glow,
  Select,
  List,
  Text,
  signal,
  renderTreeToAnsi,
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

test("layout distribui pixels de flex e mantém o gap dentro do viewport", () => {
  const tree = resolveTree(Container({ id: "app", width: 10, height: 2, direction: "row", gap: 1, children: [
    Block({ id: "a", flexGrow: 1, text: "A" }),
    Block({ id: "b", flexGrow: 1, text: "B" })
  ] }));
  assert.ok(tree);
  const layout = createFlexLayoutEngine().layout(tree, { width: 10, height: 2 });
  assert.equal(layout.children[0]?.layout.width, 4);
  assert.equal(layout.children[1]?.layout.x, 5);
  assert.equal(layout.children[1]?.layout.width, 5);
});

test("layout suporta wrap-reverse e posicionamento absoluto", () => {
  const tree = resolveTree(Container({ id: "app", width: 8, height: 4, direction: "row", wrap: "wrap-reverse", gap: 1, children: [
    Block({ id: "a", width: 3, height: 1, text: "A" }),
    Block({ id: "b", width: 3, height: 1, text: "B" }),
    Block({ id: "c", width: 3, height: 1, text: "C" }),
    Block({ id: "overlay", position: "absolute", right: 0, bottom: 0, width: 2, height: 1, text: "!" })
  ] }));
  assert.ok(tree);
  const layout = createFlexLayoutEngine().layout(tree, { width: 8, height: 4 });
  assert.equal(layout.children.find(child => child.id === "a")?.layout.y, 3);
  assert.equal(layout.children.find(child => child.id === "c")?.layout.y, 1);
  assert.deepEqual(layout.children.find(child => child.id === "overlay")?.layout, { x: 6, y: 3, width: 2, height: 1 });
});

test("fragmentos são achatados para a árvore de componentes", () => {
  const tree = resolveTree(jsx(Fragment, { children: [Block({ id: "a" }), Block({ id: "b" })] }));
  assert.equal(tree?.type, "fragment");
  assert.deepEqual(tree?.children.map(child => child.id), ["a", "b"]);
});

test("runtime combina estado, layout, foco e eventos sem React", async () => {
  const name = signal("A");
  const selected = signal(0);
  let pressed = 0;
  const app = createSlateApp(() => Container({ id: "app", direction: "column", gap: 1, children: [
    Input({ id: "name", value: name, onChange: value => { name.set(value); } }),
    Select({ id: "mode", options: [{ label: "um" }, { label: "dois" }], selectedIndex: selected, onChange: value => { selected.set(value); } }),
    Button({ id: "save", children: "Salvar", onPress: () => { pressed += 1; } })
  ] }), { viewport: { width: 24, height: 6 } });
  assert.equal(app.focus("name"), true);
  assert.equal(app.dispatch({ kind: "key", code: "b" }), "render");
  await Promise.resolve();
  assert.equal(name.peek(), "Ab");
  assert.equal(app.dispatch({ kind: "key", code: "Tab" }), "consumed");
  assert.equal(app.focused(), "mode");
  assert.equal(app.dispatch({ kind: "key", code: "ArrowDown" }), "render");
  await Promise.resolve();
  assert.equal(selected.peek(), 1);
  assert.equal(app.dispatch({ kind: "key", code: "Tab" }), "consumed");
  assert.equal(app.dispatch({ kind: "key", code: "Enter" }), "consumed");
  assert.equal(pressed, 1);
  assert.match(app.renderAnsi({ clear: false, hideCursor: false }), /Salvar/);
});

test("runtime renderiza UTF-8 e cores hex customizadas", () => {
  const tree = resolveTree(Container({ id: "app", foreground: "#0f0", children: Text({ id: "text", text: "Olá 世界" }) }));
  const layout = createFlexLayoutEngine().layout(tree, { width: 12, height: 2 });
  const output = renderTreeToAnsi(tree, layout, { width: 12, height: 2 }, { clear: false, hideCursor: false });
  assert.match(output, /Olá 世界/);
  assert.match(output, /38;2;0;255;0m/);
});

test("efeitos declarativos interpolam cada glifo sem alterar o texto", () => {
  const tree = resolveTree(Glow({ id: "glow", color: "#ffffff", children: "Slate" }));
  assert.ok(tree);
  const layout = createFlexLayoutEngine().layout(tree, { width: 8, height: 1 });
  const first = renderTreeToAnsi(tree, layout, { width: 8, height: 1 }, { clear: false, hideCursor: true, frameIndex: 0 });
  const later = renderTreeToAnsi(tree, layout, { width: 8, height: 1 }, { clear: false, hideCursor: true, frameIndex: 20 });
  assert.match(first.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ""), /Slate/);
  assert.match(later.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ""), /Slate/);
  assert.notEqual(first, later);
  const shifted = resolveTree(ColorShift({ id: "shift", from: "#000000", to: "#ffffff", children: "Slate" }));
  assert.ok(shifted);
  const shiftedLayout = createFlexLayoutEngine().layout(shifted, { width: 8, height: 1 });
  assert.match(renderTreeToAnsi(shifted, shiftedLayout, { width: 8, height: 1 }, { clear: false, hideCursor: true }), /38;2;/);
});

test("widgets e controller de checkbox são expostos pela API pública", () => {
  const checked = signal(false);
  const app = createSlateApp(() => Container({ id: "app", children: Checkbox({ id: "check", label: "Aceito", checked, onChange: value => { checked.set(value); } }) }), { viewport: { width: 20, height: 2 } });
  app.focus("check");
  assert.equal(app.dispatch({ kind: "key", code: "Space" }), "render");
  assert.equal(checked.peek(), true);
});

test("mouse foca o controle pai quando o clique atinge um filho de texto", () => {
  let pressed = 0;
  const app = createSlateApp(Container({ id: "app", children: Button({ id: "button", width: 8, height: 1, onPress: () => { pressed += 1; }, children: Text({ id: "label", text: "Salvar" }) }) }), { viewport: { width: 10, height: 2 } });
  assert.equal(app.dispatch({ kind: "mouse", action: "press", button: "left", x: 2, y: 0 }), "consumed");
  assert.equal(app.focused(), "button");
  assert.equal(pressed, 1);
});

test("Flexbox resolve porcentagens, limites, wrap e clipping", () => {
  const tree = resolveTree(Container({ id: "app", width: 8, height: 3, direction: "row", wrap: "wrap", gap: 1, overflow: "hidden", children: [
    Block({ id: "a", width: 3, height: 1, text: "A" }),
    Block({ id: "b", width: 3, height: 1, text: "B" }),
    Block({ id: "c", width: "50%", minWidth: 5, height: 1, text: "C" })
  ] }));
  assert.ok(tree);
  const layout = createFlexLayoutEngine().layout(tree, { width: 8, height: 3 });
  assert.equal(layout.children[0]?.layout.x, 0);
  assert.equal(layout.children[1]?.layout.x, 4);
  assert.equal(layout.children[2]?.layout.y, 2);
  assert.equal(hitTest(tree, layout, 7, 2).at(-1)?.id, "app");
  assert.equal(hitTest(tree, layout, 9, 1).length, 0);
});

test("scroll mantém o viewport fixo enquanto move o conteúdo", async () => {
  const tree = resolveTree(Container({ id: "app", width: 5, height: 1, overflow: "scroll", children: Block({ id: "content", width: 10, text: "abcdefghij" }) }));
  assert.ok(tree);
  const layout = createFlexLayoutEngine().layout(tree, { width: 5, height: 1 });
  assert.equal(layout.children[0]?.clip?.x, 0);
  assert.equal(layout.children[0]?.clip?.width, 5);
  const app = createSlateApp(Container({ id: "app", width: 5, height: 1, overflow: "scroll", children: Block({ id: "content", width: 10, text: "abcdefghij" }) }), { viewport: { width: 5, height: 1 } });
  assert.equal(app.scrollTo("app", 3, 0), true);
  await Promise.resolve();
  assert.match(app.renderAnsi({ clear: false, hideCursor: true }), /defgh/);
});

test("computed e effect propagam sinais com dispose", () => {
  const source = signal(2);
  const doubled = computed(() => source.get() * 2);
  let observed = 0;
  const stop = effect(() => { observed = doubled.get(); });
  assert.equal(observed, 4);
  source.set(3);
  assert.equal(observed, 6);
  stop();
  source.set(4);
  assert.equal(observed, 6);
});

test("render é o alias de aplicação TSX sem React", () => {
  const app = render(Text({ id: "text", text: "Slate" }), { viewport: { width: 10, height: 1 } });
  assert.equal(app.getTree()?.id, "text");
});

test("render aceita view baseada em estado sem opções obrigatórias", async () => {
  const app = render(state => Text({ id: "count", text: String(state.count) }), { count: 1 });
  assert.equal(app.getTree()?.props.text, "1");
  app.setState(state => ({ count: state.count + 1 }));
  await Promise.resolve();
  assert.equal(app.getTree()?.props.text, "2");
});

test("controller de terminal deduplica frames e encerra o cursor", async () => {
  const app = createSlateApp(Text({ id: "text", text: "Slate" }), { viewport: { width: 10, height: 1 } });
  const writes = [];
  const controller = createTerminalController(app, { poll: () => null }, { write: value => { writes.push(value); } }, { intervalMs: 1000 });
  controller.start();
  assert.equal(controller.running(), true);
  assert.equal(writes.length, 1);
  app.setViewport({ width: 10, height: 1 });
  await Promise.resolve();
  assert.equal(writes.length, 2);
  app.setViewport({ width: 10, height: 1 });
  await Promise.resolve();
  assert.equal(writes.length, 2);
  controller.stop();
  assert.equal(controller.running(), false);
  assert.match(writes.at(-1), /\x1b\[\?25h/);
});

test("router para quando um handler solicita exit", () => {
  const app = createSlateApp(Text({ id: "text", text: "Slate" }), { viewport: { width: 10, height: 1 } });
  app.subscribeInput(() => "exit");
  let calls = 0;
  const router = createInputRouter(app, { poll: () => calls++ === 0 ? { kind: "key", code: "Escape" } : null }, 1000);
  router.start();
  assert.equal(router.running(), false);
  assert.equal(calls, 1);
});

test("API de edição preserva update, append e remove por ID", async () => {
  const app = createSlateApp(Container({ id: "root", children: Text({ id: "message", text: "antes" }) }), { viewport: { width: 20, height: 3 } });
  assert.equal(app.update("message", { text: "depois" }), true);
  assert.equal(app.append("root", Text({ id: "extra", text: "extra" })), true);
  await Promise.resolve();
  assert.match(app.renderAnsi({ clear: false, hideCursor: true }), /depois/);
  assert.match(app.renderAnsi({ clear: false, hideCursor: true }), /extra/);
  assert.equal(app.remove("extra"), true);
  await Promise.resolve();
  assert.equal(app.getTree()?.children.some(child => child.id === "extra"), false);
});

test("widgets suportam estado interno quando props não são controladas", async () => {
  const app = createSlateApp(() => Container({ id: "root", direction: "column", children: [
    Input({ id: "input", defaultValue: "a" }),
    Select({ id: "select", options: [{ label: "um" }, { label: "dois" }] }),
    Checkbox({ id: "check" }),
    List({ id: "list", items: ["um", "dois"] })
  ] }), { viewport: { width: 20, height: 8 } });
  app.focus("input");
  app.dispatch({ kind: "key", code: "b" });
  app.focus("select");
  app.dispatch({ kind: "key", code: "ArrowDown" });
  app.focus("check");
  app.dispatch({ kind: "key", code: "Space" });
  app.focus("list");
  app.dispatch({ kind: "key", code: "ArrowDown" });
  await Promise.resolve();
  const tree = app.getTree();
  assert.equal(tree?.children.find(child => child.id === "input")?.props.value, "ab");
  assert.equal(tree?.children.find(child => child.id === "select")?.props.selectedIndex, 1);
  assert.equal(tree?.children.find(child => child.id === "check")?.props.checked, true);
  assert.equal(tree?.children.find(child => child.id === "list")?.props.activeIndex, 1);
});
