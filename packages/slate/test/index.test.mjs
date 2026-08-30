import test from "node:test";
import assert from "node:assert/strict";
import { VERSION, renderText } from "../dist/index.js";

test("expõe a versão LTS e renderiza texto", () => {
  assert.equal(VERSION, "1.0.0");
  assert.match(renderText("Slate"), /Slate/);
});
