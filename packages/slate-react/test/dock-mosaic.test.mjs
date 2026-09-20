import test from "node:test";
import assert from "node:assert/strict";
import { Container, createElement, createFlexLayoutEngine, createSlateApp, resolveTree, signal } from "../dist/index.js";
import { Dock, DockItem } from "../dist/dock.js";
import { Mosaic, MosaicItem } from "../dist/mosaic.js";

const viewport = { width: 48, height: 14 };

function flatten(node, result = []) {
  if (!node) return result;
  result.push(node);
  for (const child of node.children) flatten(child, result);
  return result;
}

test("Dock deriva IDs estáveis, compõe icon/label/children e expõe foco", () => {
  const tree = resolveTree(Dock({
    id: "dock",
    spacing: 2,
    shape: "rounded",
    children: [
      DockItem({ icon: "⌂", label: "Home" }),
      DockItem({ label: "Files", children: "•" })
    ]
  }));
  assert.ok(tree);
  const nodes = flatten(tree);
  const ids = nodes.map(node => String(node.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(tree.id, "dock");
  assert.equal(tree.props.style.flexDirection, "row");
  assert.equal(tree.props.style.gap, 2);
  assert.equal(tree.props.border.style, "rounded");
  assert.deepEqual(nodes.filter(node => node.type === "button").map(node => node.id), ["dock:item:0", "dock:item:1"]);
  assert.ok(nodes.some(node => node.props.text === "Home"));
  assert.ok(nodes.some(node => node.props.text === "Files"));
});

test("Dock dispara press por teclado e mouse e hover por move", () => {
  const events = [];
  const app = createSlateApp(Dock({
    id: "dock",
    children: [
      DockItem({ id: "home", label: "Home", onPress: () => { events.push("press"); }, onHover: () => { events.push("hover"); } }),
      DockItem({ id: "files", label: "Files", onPress: () => { events.push("files"); } })
    ]
  }), { viewport });
  assert.equal(app.focus("home"), true);
  assert.equal(app.dispatch({ kind: "key", code: "Enter" }), "consumed");
  app.dispatch({ kind: "mouse", action: "move", x: 1, y: 0 });
  app.flush();
  assert.equal(flatten(app.getTree()).find(node => node.id === "home")?.props.background, "#284777");
  assert.equal(app.dispatch({ kind: "mouse", action: "press", button: "left", x: 1, y: 0 }), "consumed");
  assert.deepEqual(events, ["press", "hover", "press"]);
  app.close();
});

test("Dock respeita disabled, active signal e shape por item", () => {
  const active = signal(false);
  const tree = resolveTree(Dock({
    id: "dock",
    items: [
      { label: "Active", active, shape: "double" },
      { label: "Disabled", disabled: true }
    ]
  }));
  assert.ok(tree);
  const buttons = flatten(tree).filter(node => node.type === "button");
  assert.equal(buttons[0]?.props.border.style, "double");
  assert.equal(buttons[0]?.props.disabled, undefined);
  assert.equal(buttons[1]?.props.disabled, true);
  active.set(true);
  const next = resolveTree(Dock({ id: "dock", items: [{ label: "Active", active }] }));
  assert.equal(next?.children[0]?.props.background, "#38bdf8");
  active.set(false);
  const app = createSlateApp(Dock({ id: "dock", items: [{ label: "Active", active }] }), { viewport });
  active.set(true);
  app.flush();
  assert.equal(flatten(app.getTree()).find(node => node.id === "dock:item:0")?.props.background, "#38bdf8");
  app.close();
});

test("Mosaic cria uma grade 2x2 com quatro itens sem colisão de IDs", () => {
  const tree = resolveTree(Mosaic({
    id: "gallery",
    children: [
      MosaicItem({ label: "One" }),
      MosaicItem({ label: "Two" }),
      MosaicItem({ label: "Three" }),
      MosaicItem({ label: "Four" })
    ]
  }));
  assert.ok(tree);
  const nodes = flatten(tree);
  const ids = nodes.map(node => String(node.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(tree.children.length, 2);
  assert.deepEqual(tree.children.map(row => row.children.length), [2, 2]);
  assert.deepEqual(nodes.filter(node => node.type === "button").map(node => node.id), [
    "gallery:item:0",
    "gallery:item:1",
    "gallery:item:2",
    "gallery:item:3"
  ]);
});

test("Dock deriva IDs para componentes filhos funcionais", () => {
  const tree = resolveTree(Dock({
    id: "dock",
    children: [
      createElement(DockItem, { label: "Function child" }),
      DockItem({ label: "Direct child" })
    ]
  }));
  assert.ok(tree);
  assert.deepEqual(
    flatten(tree).filter(node => node.type === "button").map(node => node.id),
    ["dock:item:0", "dock:item:1"]
  );
});

test("Mosaic aceita mais que quatro itens e altera colunas sem hard-code", () => {
  const items = Array.from({ length: 5 }, (_, index) => MosaicItem({ id: `tile-${index}`, label: `Tile ${index}` }));
  const tree = resolveTree(Mosaic({ id: "gallery", columns: 3, gap: 2, children: items }));
  assert.ok(tree);
  assert.equal(tree.children.length, 2);
  assert.deepEqual(tree.children.map(row => row.children.length), [3, 2]);
  assert.equal(tree.props.style.gap, 2);
  assert.deepEqual(flatten(tree).filter(node => node.type === "button").map(node => node.id), ["tile-0", "tile-1", "tile-2", "tile-3", "tile-4"]);
});

test("Mosaic deriva IDs para componentes filhos funcionais", () => {
  const tree = resolveTree(Mosaic({
    id: "gallery",
    columns: 2,
    children: [
      createElement(MosaicItem, { label: "Function child" }),
      MosaicItem({ label: "Direct child" })
    ]
  }));
  assert.ok(tree);
  assert.deepEqual(
    flatten(tree).filter(node => node.type === "button").map(node => node.id),
    ["gallery:item:0", "gallery:item:1"]
  );
});

test("MosaicItem preserva media, effect, variante, bordas e callbacks", () => {
  const effect = { kind: "glow", color: "#ffffff", radius: 2 };
  const selected = signal(true);
  const tree = resolveTree(Mosaic({
    id: "gallery",
    children: MosaicItem({
      id: "preview",
      image: "data:image/png;base64,AAAA",
      alt: "Preview",
      selected,
      border: "heavy",
      effect,
      variant: "expressive",
      description: "A tile"
    })
  }));
  assert.ok(tree);
  const nodes = flatten(tree);
  const button = nodes.find(node => node.id === "preview");
  const image = nodes.find(node => node.type === "image");
  assert.equal(button?.props.border.style, "heavy");
  assert.deepEqual(button?.props.effect, effect);
  assert.equal(button?.props.textStyle.bold, true);
  assert.equal(image?.props.alt, "Preview");
  assert.equal(image?.props.source, "data:image/png;base64,AAAA");
});

test("MosaicItem dispatcha press/hover e não ativa item desabilitado", () => {
  const events = [];
  const app = createSlateApp(() => Mosaic({
    id: "gallery",
    children: [
      MosaicItem({ id: "one", label: "One", onPress: () => { events.push("press"); }, onHover: () => { events.push("hover"); } }),
      MosaicItem({ id: "two", label: "Two", disabled: true, onPress: () => { events.push("disabled"); } })
    ]
  }), { viewport });
  assert.equal(app.focus("one"), true);
  assert.equal(app.dispatch({ kind: "key", code: "Space" }), "consumed");
  app.dispatch({ kind: "mouse", action: "move", x: 1, y: 0 });
  assert.equal(app.dispatch({ kind: "mouse", action: "press", button: "left", x: 1, y: 0 }), "consumed");
  assert.equal(app.focus("two"), false);
  assert.deepEqual(events, ["press", "hover", "press"]);
  app.close();
});

test("MosaicItem aplica hover visual e seleciona por signal", () => {
  const selected = signal(false);
  const app = createSlateApp(Mosaic({
    id: "gallery",
    children: MosaicItem({ id: "one", label: "One", selected })
  }), { viewport });
  app.dispatch({ kind: "mouse", action: "move", x: 1, y: 0 });
  app.flush();
  assert.equal(flatten(app.getTree()).find(node => node.id === "one")?.props.background, "#284777");
  app.dispatch({ kind: "mouse", action: "move", x: 47, y: 13 });
  app.flush();
  selected.set(true);
  app.flush();
  assert.equal(flatten(app.getTree()).find(node => node.id === "one")?.props.background, "#38bdf8");
  app.close();
});

test("Mosaic mede as células e mantém a composição customizada", () => {
  const tree = resolveTree(Mosaic({
    id: "gallery",
    columns: 2,
    children: [MosaicItem({ id: "a", children: Container({ id: "custom", text: "custom" }) })]
  }));
  assert.ok(tree);
  const layout = createFlexLayoutEngine().layout(tree, viewport);
  assert.equal(layout.children.length, 1);
  assert.equal(flatten(tree).some(node => node.id === "custom"), true);
});
