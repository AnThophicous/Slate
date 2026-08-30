import test from "node:test";
import assert from "node:assert/strict";
import { VERSION, hex, createInkAdapter, renderText } from "../dist/index.js";

test("expõe a versão LTS e renderiza texto", () => {
  assert.equal(VERSION, "1.5.0");
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
