import test from "node:test";
import assert from "node:assert/strict";
import { Block, Button, Container, createApp } from "../dist/index.js";
import { jsx, jsxs } from "../dist/jsx-runtime.js";

test("edita nós por ID e roteia eventos ao botão", () => {
  let presses = 0;
  const root = Container({ id: "root", children: Button({ id: "button", label: "Enviar", width: 10, height: 1, onPress: () => { presses += 1; }, children: Block({ id: "label", text: "Detalhe" }) }) });
  const app = createApp(root);
  assert.equal(app.setText("label", "Confirmar"), true);
  assert.equal(app.setPlaceholder("label", "placeholder"), true);
  assert.equal(app.dispatch({ kind: "mouse", action: "press", button: "left", x: 0, y: 0 }), "render");
  assert.equal(presses, 1);
  assert.equal(app.focus("button"), true);
  assert.equal(app.dispatch({ kind: "key", code: "Enter" }), "render");
  assert.equal(presses, 2);
});

test("runtime JSX cria containers, blocos e botões sem React", () => {
  const tree = jsxs(Container, { id: "root", children: [jsx(Block, { id: "title", text: "Olá" }), jsx(Button, { id: "send", label: "Enviar" })] });
  const app = createApp(tree);
  assert.ok(app.find("title"));
  assert.match(app.render(), /Olá/);
  assert.match(app.render(), /Enviar/);
});
