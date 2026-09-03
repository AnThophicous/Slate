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
  createNormalizedInput,
  createTerminalController,
  createSlateOutput,
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
  Image,
  LogView,
  Text,
  signal,
  renderTreeToAnsi,
  createMediaSource,
  renderMedia,
  adaptLegacyRenderer,
  createReactTerminalRoot,
  sameEvent,
  semanticEventKey,
  isEmergencyExit,
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

test("renderer ancora cada linha na coluna zero", () => {
  const tree = resolveTree(Container({ id: "app", width: 6, height: 2, children: Text({ id: "text", text: "ab\ncd" }) }));
  const layout = createFlexLayoutEngine().layout(tree, { width: 6, height: 2 });
  const output = renderTreeToAnsi(tree, layout, { width: 6, height: 2 }, { clear: false, hideCursor: true });
  assert.match(output, /\u001b\[2;1H/);
  assert.doesNotMatch(output, /ab\ncd/);
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

test("router.close libera a fonte e desmonta o app", () => {
  const app = createSlateApp(Text({ id: "text", text: "Slate" }), { viewport: { width: 10, height: 1 } });
  let released = 0;
  const router = createInputRouter(app, { poll: () => null, close: () => { released += 1; } }, 1000);
  router.close();
  router.close();
  assert.equal(released, 1);
  assert.equal(app.getTree(), null);
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

test("normaliza mouse de fontes Windows e deduplica eventos semanticamente", () => {
  const first = { kind: "mouse", action: "Moved", button: "Left", x: 4, y: 2 };
  const source = {
    events: [first, { ...first }, null],
    poll() { return this.events.shift() ?? null; }
  };
  const input = createNormalizedInput(source);
  const normalized = input.poll();
  assert.equal(normalized?.action, "move");
  assert.equal(normalized?.button, "left");
  assert.equal(input.poll(), null);
  assert.equal(sameEvent(first, { ...first, action: "move", button: "left" }), true);
  assert.equal(sameEvent(normalized, { ...normalized, id: "different" }), true);
  assert.equal(semanticEventKey(normalized).includes("different"), false);
});

test("hit-test expõe o alvo, não propaga mouse fora da viewport e deixa disabled passar ao pai", () => {
  let parentEvents = 0;
  let childPresses = 0;
  const app = createSlateApp(Container({
    id: "root",
    width: 8,
    height: 2,
    onMouse: event => {
      parentEvents += 1;
      assert.equal(event.target, "disabled");
      return "consumed";
    },
    children: Button({ id: "disabled", width: 8, disabled: true, onPress: () => { childPresses += 1; } })
  }), { viewport: { width: 8, height: 2 } });
  assert.equal(app.dispatch({ kind: "mouse", action: "press", button: "left", x: 2, y: 0 }), "consumed");
  assert.equal(parentEvents, 1);
  assert.equal(childPresses, 0);
  assert.equal(app.dispatch({ kind: "mouse", action: "press", button: "left", x: 20, y: 0 }), "ignored");
  assert.equal(parentEvents, 1);
});

test("onHover sinaliza entrada, troca e saída do alvo", () => {
  const events = [];
  const app = createSlateApp(Container({ id: "root", width: 10, height: 1, direction: "row", children: [
    Block({ id: "left", width: 5, onHover: event => { events.push(["left", event.target]); return "render"; } }),
    Block({ id: "right", width: 5, onHover: event => { events.push(["right", event.target]); return "render"; } })
  ] }), { viewport: { width: 10, height: 1 } });
  assert.equal(app.dispatch({ kind: "mouse", action: "move", x: 1, y: 0 }), "render");
  app.dispatch({ kind: "mouse", action: "move", x: 6, y: 0 });
  app.dispatch({ kind: "mouse", action: "move", x: 20, y: 0 });
  assert.deepEqual(events, [["left", "left"], ["left", "right"], ["right", "right"], ["right", undefined]]);
});

test("Ctrl+C é uma saída de emergência e close desmonta o app", () => {
  const app = createSlateApp(Text({ id: "text", text: "Slate" }), { viewport: { width: 8, height: 1 } });
  const event = { kind: "key", code: "c", modifiers: 2 };
  assert.equal(isEmergencyExit(event), true);
  assert.equal(app.dispatch(event), "exit");
  app.close();
  assert.equal(app.getTree(), null);
});

test("controller fecha input, subscriptions e cursor ao receber Ctrl+C", () => {
  const app = createSlateApp(Text({ id: "text", text: "Slate" }), { viewport: { width: 8, height: 1 } });
  const writes = [];
  let exited = 0;
  let released = 0;
  const controller = createTerminalController(app, {
    poll: () => ({ kind: "key", code: "c", modifiers: 2 }),
    close: () => { released += 1; }
  }, { write: value => { writes.push(value); } }, { onExit: () => { exited += 1; } });
  controller.start();
  assert.equal(controller.running(), false);
  assert.equal(exited, 1);
  assert.equal(released, 1);
  assert.equal(app.getTree(), null);
  assert.match(writes.at(-1), /\x1b\[\?25h/);
  controller.close();
});

test("resize atualiza o viewport e multiline/wrapping respeitam graphemes", async () => {
  const app = createSlateApp(Text({ id: "text", width: 3, height: 3, text: "a👩‍💻b\ncd" }), { viewport: { width: 3, height: 3 } });
  app.dispatch({ kind: "resize", width: 4, height: 5 });
  await Promise.resolve();
  assert.deepEqual(app.getViewport(), { width: 4, height: 5 });
  const tree = app.getTree();
  const layout = app.getLayout();
  const plain = app.renderAnsi({ clear: false, hideCursor: true }).replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "").replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
  assert.ok(tree && layout);
  assert.match(plain, /a👩‍💻/);
  assert.match(plain, /b/);
  assert.match(plain, /cd/);
});

test("LogView aceita runs com estilo e links ANSI", () => {
  const tree = resolveTree(LogView({ id: "log", lines: [
    { runs: [{ text: "OK", style: { bold: true, foreground: "#00ff00" } }, { text: " docs", link: "https://example.com" }] },
    { text: "linha 2", style: { underline: true } }
  ] }));
  const layout = createFlexLayoutEngine().layout(tree, { width: 30, height: 4 });
  const output = renderTreeToAnsi(tree, layout, { width: 30, height: 4 }, { clear: false, hideCursor: true });
  assert.match(output, /OK/);
  assert.match(output, /38;2;0;255;0/);
  assert.match(output, /\x1b\]8;;https:\/\/example\.com/);
  assert.match(output, /linha 2/);
});

test("adaptLegacyRenderer envolve renderers antigos no host Slate", () => {
  const Legacy = adaptLegacyRenderer(props => String(props.label ?? "legacy"));
  const tree = resolveTree(Legacy({ id: "legacy", label: "compatível" }));
  assert.equal(tree?.type, "block");
  assert.equal(tree?.children[0]?.props.text, "compatível");
});

test("React reconciler monta uma árvore sem produzir root vazio", async () => {
  const React = await import("react");
  const root = await createReactTerminalRoot({ viewport: { width: 20, height: 2 } });
  const writes = [];
  const controller = createTerminalController(root.app, { poll: () => null }, { write: value => { writes.push(value); } });
  controller.start();
  assert.equal(writes.length, 0);
  root.render(React.createElement("container", { id: "react-root" }, React.createElement("text", { id: "message", text: "React" })));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(root.app.getTree()?.id, "react-root");
  assert.match(writes.at(-1), /React/);
  controller.close();
  root.close();
});

test("captura ponteiro durante drag e libera no release", () => {
  const events = [];
  const app = createSlateApp(Container({ id: "root", width: 8, height: 2, children: Button({
    id: "drag", width: 8, capturePointer: true,
    onMouse: event => { events.push([event.action, event.target]); }
  }) }), { viewport: { width: 8, height: 2 } });
  app.dispatch({ kind: "mouse", action: "press", button: "left", x: 2, y: 0 });
  app.dispatch({ kind: "mouse", action: "drag", button: "left", x: 20, y: 0 });
  app.dispatch({ kind: "mouse", action: "release", button: "left", x: 20, y: 0 });
  app.dispatch({ kind: "mouse", action: "drag", button: "left", x: 20, y: 0 });
  assert.deepEqual(events, [["press", "drag"], ["drag", "drag"], ["release", "drag"]]);
});

test("router captura falha de input, libera a fonte e desmonta o app", () => {
  const app = createSlateApp(Text({ id: "text", text: "Slate" }), { viewport: { width: 8, height: 1 } });
  let released = 0;
  let failure;
  const router = createInputRouter(app, {
    poll: () => { throw new Error("input quebrado"); },
    close: () => { released += 1; }
  }, 0, undefined, error => { failure = error; });
  router.start();
  assert.equal(router.running(), false);
  assert.equal(released, 1);
  assert.equal(app.getTree(), null);
  assert.equal(router.error(), failure);
  assert.match(failure.message, /input quebrado/);
});

test("controller fecha o terminal quando a saída falha", () => {
  const app = createSlateApp(Text({ id: "text", text: "Slate" }), { viewport: { width: 8, height: 1 } });
  let released = 0;
  const controller = createTerminalController(app, {
    poll: () => null,
    close: () => { released += 1; }
  }, { write: () => { throw new Error("stdout quebrado"); } });
  controller.start();
  assert.equal(controller.running(), false);
  assert.match(controller.error().message, /stdout quebrado/);
  assert.equal(released, 1);
  assert.equal(app.getTree(), null);
});

test("limita feedback loop de renderização sem deixar o app preso", () => {
  const value = signal(0);
  const app = createSlateApp(() => Text({ id: "text", text: String(value.get()) }), { maxRenderPasses: 3, viewport: { width: 8, height: 1 } });
  const unsubscribe = app.subscribe(() => { value.set(value.peek() + 1); });
  value.set(1);
  assert.throws(() => app.flush(), /loop de renderização/);
  unsubscribe();
  assert.equal(app.flush().length >= 0, true);
});

test("renderer remove controles ANSI de texto e desenha bordas reais", () => {
  const tree = resolveTree(Container({ id: "panel", width: 8, height: 3, border: { style: "rounded", color: "#00ffcc" }, children: Text({ id: "text", text: "ok\u001b[31m" }) }));
  const layout = createFlexLayoutEngine().layout(tree, { width: 8, height: 3 });
  const output = renderTreeToAnsi(tree, layout, { width: 8, height: 3 }, { clear: false, hideCursor: true });
  assert.match(output, /╭/);
  assert.doesNotMatch(output, /\u001b\[31m/);
});

test("media usa protocolo explícito e mantém fallback seguro", () => {
  const source = createMediaSource(Buffer.from("png-placeholder"), "image/png", "cover.png");
  const inline = renderMedia(source, { x: 1, y: 2, width: 4, height: 3, protocol: "iterm2" });
  assert.match(inline, /1337;File=inline=1/);
  assert.match(inline, /cG5nLXBsYWNlaG9sZGVy/);
  assert.equal(renderMedia(source, { x: 0, y: 0, width: 2, height: 2, protocol: "none" }), "");
  const tree = resolveTree(Image({ id: "image", width: 4, height: 3, source }));
  const layout = createFlexLayoutEngine().layout(tree, { width: 4, height: 3 });
  assert.match(renderTreeToAnsi(tree, layout, { width: 4, height: 3 }, { clear: false, hideCursor: true, mediaProtocol: "iterm2" }), /1337;File=inline=1/);
  const bareBase64 = resolveTree(Image({ id: "bare", width: 2, height: 2, source: "cG5nLXBsYWNlaG9sZGVy", mimeType: "image/png" }));
  const bareLayout = createFlexLayoutEngine().layout(bareBase64, { width: 2, height: 2 });
  assert.match(renderTreeToAnsi(bareBase64, bareLayout, { width: 2, height: 2 }, { clear: false, hideCursor: true, mediaProtocol: "iterm2" }), /1337;File=inline=1/);
});

test("frame dedupe permite retry depois de uma falha de escrita", () => {
  let attempts = 0;
  const output = createSlateOutput({ write: () => {
    attempts += 1;
    if (attempts === 1) throw new Error("falha transitória");
    return true;
  } });
  assert.throws(() => output.write("frame"), /falha transitória/);
  assert.equal(output.write("frame"), true);
  assert.equal(attempts, 2);
});
