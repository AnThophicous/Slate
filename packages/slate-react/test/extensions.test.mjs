import test from "node:test";
import assert from "node:assert/strict";
import {
  BUILT_IN_WIDGET_TYPES,
  Container,
  clearExtensions,
  createFlexLayoutEngine,
  createSlateApp,
  createWidget,
  getWidget,
  listExtensions,
  registerExtension,
  registerWidget,
  renderTreeToAnsi,
  resolveTree,
  runExtensionConformance
} from "../dist/index.js";

const viewport = { width: 24, height: 6 };

const sparkline = {
  type: "sparkline",
  defaultProps: { focusable: true },
  text: node => {
    const values = Array.isArray(node.props.values) ? node.props.values : [];
    const glyphs = "▁▂▃▄▅▆▇█";
    const max = Math.max(1, ...values);
    return [values.map(value => glyphs[Math.min(glyphs.length - 1, Math.floor((value / max) * (glyphs.length - 1)))]).join("")];
  },
  handleEvent: (node, event) => (event.kind === "key" && event.code === "Space" ? "consumed" : "ignored")
};

test.afterEach(() => clearExtensions());

test("um widget de extensão é medido e desenhado como um widget do núcleo", () => {
  registerExtension({ name: "demo", version: "1.0.0", widgets: [sparkline] });
  const Sparkline = createWidget(sparkline);
  const tree = resolveTree(Container({ id: "root", children: [Sparkline({ id: "spark", values: [1, 4, 8] })] }));
  const layout = createFlexLayoutEngine().layout(tree, viewport);
  const node = layout.children[0];
  assert.equal(node.id, "spark");
  assert.equal(node.layout.width, 3, "o layout mede as três colunas que o widget imprime");
  assert.match(renderTreeToAnsi(tree, layout, viewport), /█/);
});

test("o widget de extensão recebe eventos depois dos handlers do nó", () => {
  registerExtension({ name: "demo", widgets: [sparkline] });
  const Sparkline = createWidget(sparkline);
  const seen = [];
  const app = createSlateApp(() => Container({
    id: "root",
    children: [Sparkline({
      id: "spark",
      values: [1, 2],
      onKey: event => {
        seen.push(event.code);
        return "ignored";
      }
    })]
  }), { viewport });
  app.mount();
  app.focus("spark");
  assert.equal(app.dispatch({ kind: "key", code: "Space" }), "consumed");
  assert.equal(app.dispatch({ kind: "key", code: "Escape" }), "ignored");
  assert.deepEqual(seen, ["Space", "Escape"], "o handler do nó continua vindo primeiro");
  app.close();
});

test("dispose remove os types e o registro da extensão", () => {
  const registration = registerExtension({ name: "demo", widgets: [sparkline] });
  assert.equal(getWidget("sparkline")?.type, "sparkline");
  assert.deepEqual(listExtensions().map(entry => entry.name), ["demo"]);
  registration.dispose();
  registration.dispose();
  assert.equal(getWidget("sparkline"), undefined);
  assert.deepEqual(listExtensions(), []);
});

test("registrar a mesma extensão duas vezes não duplica o registro", () => {
  registerExtension({ name: "demo", widgets: [sparkline] });
  const second = registerExtension({ name: "demo", widgets: [sparkline] });
  assert.equal(listExtensions().length, 1);
  second.dispose();
  assert.equal(getWidget("sparkline"), undefined);
});

test("setup roda uma vez e seu teardown é chamado no dispose", () => {
  const calls = [];
  const registration = registerExtension({
    name: "demo",
    setup: context => {
      calls.push(`setup:${context.name}`);
      context.registerWidget({ type: "extra", text: () => ["extra"] });
      return () => calls.push("teardown");
    }
  });
  assert.deepEqual(calls, ["setup:demo"]);
  assert.equal(getWidget("extra")?.type, "extra");
  registration.dispose();
  assert.deepEqual(calls, ["setup:demo", "teardown"]);
  assert.equal(getWidget("extra"), undefined);
});

test("os types do núcleo não podem ser redefinidos", () => {
  for (const type of ["text", "input", "table"]) {
    assert.ok(BUILT_IN_WIDGET_TYPES.includes(type));
    assert.throws(() => registerWidget({ type, text: () => [""] }), /pertence ao Slate/);
  }
});

test("sequências de controle vindas de uma extensão não chegam ao renderer", () => {
  registerExtension({ name: "hostil", widgets: [{ type: "hostil", text: () => ["ok\u001b[31mvermelho"] }] });
  const Hostil = createWidget({ type: "hostil" });
  const tree = resolveTree(Container({ id: "root", children: [Hostil({ id: "h" })] }));
  const layout = createFlexLayoutEngine().layout(tree, viewport);
  const output = renderTreeToAnsi(tree, layout, viewport);
  assert.doesNotMatch(output, /\u001b\[31m/);
  assert.match(output, /okvermelho/);
});

test("a suíte de conformidade aprova uma extensão correta", () => {
  const report = runExtensionConformance({ name: "demo", version: "1.0.0", widgets: [sparkline] });
  assert.equal(report.passed, true, JSON.stringify(report.checks.filter(check => !check.passed)));
  assert.equal(getWidget("sparkline"), undefined, "a suíte não deixa a extensão registrada");
});

test("a conformidade reprova type reservado, saída não determinística e ANSI", () => {
  const reserved = runExtensionConformance({ name: "x", widgets: [{ type: "text", text: () => [""] }] });
  assert.equal(reserved.passed, false);
  assert.ok(reserved.checks.some(check => check.name === "types-livres" && !check.passed));

  let counter = 0;
  const unstable = runExtensionConformance({ name: "y", widgets: [{ type: "instavel", text: () => [String(counter++)] }] });
  assert.equal(unstable.passed, false);
  assert.ok(unstable.checks.some(check => check.name === "instavel:determinismo" && !check.passed));

  const injecting = runExtensionConformance({ name: "z", widgets: [{ type: "injetor", text: () => ["\u001b[2J"] }] });
  assert.equal(injecting.passed, false);
  assert.ok(injecting.checks.some(check => check.name === "injetor:sem-ansi" && !check.passed));

  const nameless = runExtensionConformance({ name: "", widgets: [] });
  assert.equal(nameless.passed, false);
});

test("uma extensão que lança em text() é reprovada sem derrubar a suíte", () => {
  const report = runExtensionConformance({
    name: "quebrado",
    widgets: [{
      type: "quebrado",
      text: () => {
        throw new Error("falhou");
      }
    }]
  });
  assert.equal(report.passed, false);
  assert.ok(report.checks.some(check => check.detail.includes("falhou")));
  assert.equal(getWidget("quebrado"), undefined);
});
