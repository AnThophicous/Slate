import test from "node:test";
import assert from "node:assert/strict";
import { Button, Container, createSlateApp } from "../dist/index.js";

test("capturePointer false nao prende drag e release fora da caixa", () => {
  const events = [];
  const app = createSlateApp(Container({
    id: "root",
    width: 8,
    height: 2,
    children: Button({
      id: "button",
      width: 8,
      capturePointer: false,
      onMouse: event => { events.push(event.action); }
    })
  }), { viewport: { width: 8, height: 2 } });

  app.dispatch({ kind: "mouse", action: "press", button: "left", x: 2, y: 0 });
  app.dispatch({ kind: "mouse", action: "drag", button: "left", x: 20, y: 0 });
  app.dispatch({ kind: "mouse", action: "release", button: "left", x: 20, y: 0 });

  assert.deepEqual(events, ["press"]);
});
