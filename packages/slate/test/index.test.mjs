import test from "node:test";
import assert from "node:assert/strict";
import { VERSION, Button, Container, Input, computed, createApp, createInkAdapter, createLegacyRendererAdapter, effect, hex, renderText, signal } from "../dist/index.js";

test("expõe a versão LTS e renderiza texto", () => {
  assert.equal(VERSION, "2.2.2");
  assert.match(renderText("Slate"), /Slate/);
});

test("valida cores hex e preserva UTF-8", () => {
  assert.equal(hex("#abc"), "#aabbcc");
  assert.equal(hex("#12AbEf"), "#12AbEf");
  assert.match(renderText("Olá 世界", { foreground: hex("#123456") }), /Olá 世界/);
});

test("oferece adaptador compatível com composição do Ink", () => {
  const render = createInkAdapter({ foreground: "#123456" });
  assert.match(render("Slate"), /Slate/);
});

test("oferece adaptador oficial para renderer textual legado", () => {
  const legacy = createLegacyRendererAdapter((text, options) => `${options?.foreground ?? "plain"}:${text}`, { foreground: "#abc" });
  assert.equal(legacy("Slate"), "#abc:Slate");
});

test("Ctrl+C retorna exit no app imperativo", () => {
  const app = createApp(Container({ id: "root", children: "Slate" }));
  assert.equal(app.dispatch({ kind: "key", code: "c", modifiers: 2 }), "exit");
});

test("expõe sinais, widgets e navegação de foco no core", () => {
  const value = signal(1);
  let updates = 0;
  value.subscribe(() => { updates += 1; });
  value.update(current => current + 1);
  assert.equal(value.peek(), 2);
  assert.equal(updates, 1);
  const input = Input({ id: "input", value });
  const root = Container({ id: "root", children: [input, Button({ id: "button", label: "OK" })] });
  const app = createApp(root);
  assert.equal(app.focusNext(), "input");
  assert.equal(app.focusNext(), "button");
});

test("core oferece computed, effect e batch sem React", () => {
  const source = signal(2);
  const doubled = computed(() => source.get() * 2);
  let observed = 0;
  let updates = 0;
  const stop = effect(() => { observed = doubled.get(); updates += 1; });
  source.set(3);
  assert.equal(observed, 6);
  assert.equal(updates, 2);
  stop();
  source.set(4);
  assert.equal(observed, 6);
});
