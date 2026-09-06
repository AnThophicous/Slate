import test from "node:test";
import assert from "node:assert/strict";
import {
  Alert,
  Badge,
  Card,
  Container,
  Gauge,
  KeyHint,
  StatusBar,
  Tree,
  createFlexLayoutEngine,
  createSlateApp,
  createTheme,
  flattenTree,
  getTheme,
  renderTreeToAnsi,
  resetTheme,
  resolveTree,
  setTheme,
  themeColor,
  withTheme
} from "../dist/index.js";

const viewport = { width: 40, height: 10 };

function draw(child, options = {}) {
  const tree = resolveTree(Container({ id: "root", children: [child] }));
  const layout = createFlexLayoutEngine().layout(tree, viewport);
  return { tree, output: renderTreeToAnsi(tree, layout, viewport, options) };
}

/** Same frame without color, so a text assertion is not split by SGR codes. */
function drawPlain(child) {
  return draw(child, { colors: "none" }).output;
}

test.afterEach(() => resetTheme());

test("o tema padrão mantém as cores que os componentes já usavam", () => {
  const theme = createTheme();
  assert.equal(theme.colors.surface, "#151a24");
  assert.equal(theme.colors.badge, "#334155");
  assert.equal(theme.colors.divider, "#475569");
  assert.equal(theme.colors.primary, "#38bdf8");
  assert.equal(theme.colors.danger, "#fb7185");
  assert.equal(theme.spacing.md, 2);
  assert.match(draw(Card({ id: "card", children: "oi" })).output, /48;2;21;26;36/);
  assert.match(draw(Alert({ id: "alerta", severity: "error", children: "falha" })).output, /38;2;251;113;133/);
});

test("setTheme repinta os componentes sem trocar de componente", () => {
  setTheme({ colors: { surface: "#102030", badge: "#405060" } });
  assert.equal(getTheme().colors.surface, "#102030");
  assert.equal(themeColor("badge"), "#405060");
  assert.match(draw(Card({ id: "card", children: "oi" })).output, /48;2;16;32;48/);
  assert.match(draw(Badge({ id: "b", children: "novo" })).output, /48;2;64;80;96/);
  resetTheme();
  assert.equal(getTheme().colors.surface, "#151a24");
});

test("withTheme é escopado e restaura o tema anterior", () => {
  setTheme({ colors: { primary: "#111111" } });
  const inside = withTheme({ colors: { primary: "#222222" } }, () => themeColor("primary"));
  assert.equal(inside, "#222222");
  assert.equal(themeColor("primary"), "#111111");
});

test("o tema define o estilo de borda dos painéis", () => {
  setTheme({ border: "double" });
  assert.match(draw(Card({ id: "card", children: "oi" })).output, /╔/);
  resetTheme();
  assert.match(draw(Card({ id: "card", children: "oi" })).output, /┌/);
});

test("Gauge desenha a proporção pedida e a porcentagem", () => {
  const output = drawPlain(Gauge({ id: "cpu", label: "CPU", value: 25, max: 100, size: 8 }));
  assert.match(output, /CPU ██░░░░░░ 25%/, "duas células cheias de oito, sem espaço no meio da barra");
  const full = drawPlain(Gauge({ id: "cheio", value: 1, max: 1, size: 4, showValue: false }));
  assert.match(full, /████/);
  assert.doesNotMatch(full, /100%/);
});

test("Gauge tolera limites degenerados", () => {
  assert.doesNotThrow(() => draw(Gauge({ id: "g", value: 5, max: 0 })));
  const negative = drawPlain(Gauge({ id: "g", value: -10, max: 10, size: 4 }));
  assert.match(negative, /0%/);
});

test("KeyHint lista os atalhos com a cor do tema", () => {
  assert.match(drawPlain(KeyHint({ id: "hints", hints: [{ key: "^C", label: "sair" }, { key: "Tab", label: "próximo" }] })), /\^C sair {2}Tab próximo/);
  assert.match(draw(KeyHint({ id: "hints", hints: [{ key: "^C", label: "sair" }] })).output, /38;2;56;189;248/);
});

test("StatusBar posiciona as três regiões em uma linha", () => {
  const { tree, output } = draw(StatusBar({ id: "status", left: "esquerda", center: "centro", right: "direita" }));
  const ids = [];
  const walk = node => {
    ids.push(String(node.id));
    for (const child of node.children) walk(child);
  };
  walk(tree);
  assert.ok(ids.includes("status:left"));
  assert.ok(ids.includes("status:center"));
  assert.ok(ids.includes("status:right"));
  const line = output.split("\n").find(row => row.includes("esquerda"));
  assert.ok(line.indexOf("esquerda") < line.indexOf("centro"));
  assert.ok(line.indexOf("centro") < line.indexOf("direita"));
});

test("flattenTree respeita os nós recolhidos", () => {
  const nodes = [
    { label: "src", children: [{ label: "index.ts" }, { label: "lib", children: [{ label: "flex.ts" }] }] },
    { label: "docs", expanded: false, children: [{ label: "guide.md" }] }
  ];
  const rows = flattenTree(nodes);
  assert.deepEqual(rows.map(row => row.label.trim()), ["▾ src", "index.ts", "▾ lib", "flex.ts", "▸ docs"]);
  assert.equal(rows[1].depth, 1);
  assert.equal(rows[3].depth, 2);
  assert.equal(rows[4].expandable, true);
  assert.equal(rows[4].expanded, false);
  assert.equal(flattenTree(nodes, { indent: 4 })[1].label.startsWith("    "), true);
});

test("Tree navega como uma List e informa o índice escolhido", () => {
  const chosen = [];
  const nodes = [{ label: "a", children: [{ label: "b" }] }, { label: "c" }];
  const app = createSlateApp(() => Container({
    id: "root",
    children: [Tree({ id: "arvore", nodes, onChange: value => chosen.push(value) })]
  }), { viewport });
  app.mount();
  app.focus("arvore");
  app.dispatch({ kind: "key", code: "ArrowDown" });
  app.dispatch({ kind: "key", code: "ArrowDown" });
  assert.deepEqual(chosen, [1, 2]);
  assert.match(app.renderAnsi(), /▾ a/);
  app.close();
});
