import test from "node:test";
import assert from "node:assert/strict";
import {
  Button,
  Checkbox,
  Container,
  Input,
  Select,
  Tabs,
  createCheckboxController,
  createFocusManager,
  createInputController,
  createSelectController,
  createSlateApp,
  createTabsController,
  isEmergencyExit,
  normalizeEvent,
  signal
} from "../dist/index.js";

test("BackTab conserva Shift e scroll aliases conservam direção", () => {
  const backTab = normalizeEvent({ kind: "key", code: "BackTab" });
  assert.equal(backTab.code, "Tab");
  assert.equal(backTab.modifiers, 1);

  const scrollDown = normalizeEvent({ kind: "mouse", action: "ScrollDown" });
  const scrollLeft = normalizeEvent({ kind: "mouse", action: "ScrollLeft" });
  assert.equal(scrollDown.action, "scroll");
  assert.equal(scrollDown.deltaY, 1);
  assert.equal(scrollLeft.action, "scroll");
  assert.equal(scrollLeft.deltaX, -1);
});

test("normalizador descarta campos textuais malformados sem lançar", () => {
  const normalized = normalizeEvent({ kind: "key", code: null, text: 7, phase: "Release", modifiers: "2" });
  assert.equal(normalized.code, undefined);
  assert.equal(normalized.text, undefined);
  assert.equal(normalized.phase, "release");
  assert.equal(normalized.modifiers, 2);
});

test("Ctrl+C em release não encerra a aplicação mesmo com phase não canônica", () => {
  assert.equal(isEmergencyExit({ kind: "key", code: "c", modifiers: 2, phase: "Release" }), false);
});

test("BackTab move o foco para trás em uma aplicação montada", () => {
  const app = createSlateApp(() => Container({
    id: "root",
    direction: "column",
    children: [Input({ id: "one" }), Input({ id: "two" }), Input({ id: "three" })]
  }), { viewport: { width: 20, height: 3 } });

  assert.equal(app.focus("two"), true);
  assert.equal(app.dispatch({ kind: "key", code: "BackTab" }), "consumed");
  assert.equal(app.focused(), "one");
});

test("FocusManager não navega no release de Tab", () => {
  const manager = createFocusManager();
  manager.setOrder(["one", "two"]);
  assert.equal(manager.focus("one"), true);
  assert.equal(manager.handle({ kind: "key", code: "Tab", phase: "release" }), false);
  assert.equal(manager.focused(), "one");
});

test("controller de input ignora release e consome paste/IME vazio", () => {
  const controller = createInputController("ab");
  assert.equal(controller.handle({ kind: "key", code: "x", phase: "release" }), "ignored");
  assert.equal(controller.value.peek(), "ab");
  assert.equal(controller.handle({ kind: "paste", text: "" }), "consumed");
  assert.equal(controller.handle({ kind: "ime" }), "consumed");
  assert.equal(controller.value.peek(), "ab");
});

test("controller de input prefere texto e limita cursor a graphemes válidos", () => {
  const controller = createInputController("ab");
  controller.cursor.set(-1);
  assert.equal(controller.handle({ kind: "key", code: "x" }), "render");
  assert.equal(controller.value.peek(), "xab");
  assert.equal(controller.cursor.peek(), 1);

  assert.equal(controller.handle({ kind: "key", code: "x", text: "👩‍💻" }), "render");
  assert.equal(controller.value.peek(), "x👩‍💻ab");
  assert.equal(controller.cursor.peek(), 2);
});

test("controller de input cola paste multigrapheme sem quebrar o cursor", () => {
  const controller = createInputController("a");
  assert.equal(controller.handle({ kind: "paste", text: "👩‍💻é" }), "render");
  assert.equal(controller.value.peek(), "a👩‍💻é");
  assert.equal(controller.cursor.peek(), 3);
  assert.equal(controller.handle({ kind: "key", code: "Backspace" }), "render");
  assert.equal(controller.value.peek(), "a👩‍💻");
  assert.equal(controller.cursor.peek(), 2);
});

test("Input público consome paste e IME vazios sem renderizar", () => {
  const app = createSlateApp(Input({ id: "field", defaultValue: "a" }), { viewport: { width: 12, height: 1 } });
  assert.equal(app.focus("field"), true);
  assert.equal(app.dispatch({ kind: "paste", text: "" }), "consumed");
  assert.equal(app.dispatch({ kind: "ime" }), "consumed");
  assert.equal(app.getTree()?.props.defaultValue, "a");
  assert.match(app.renderAnsi({ clear: false, hideCursor: true }), /a/);
});

test("controller de checkbox ignora release", () => {
  const controller = createCheckboxController(false);
  assert.equal(controller.handle({ kind: "key", code: "Space", phase: "release" }), "ignored");
  assert.equal(controller.checked.peek(), false);
  assert.equal(controller.handle({ kind: "key", code: "Space", phase: "press" }), "render");
  assert.equal(controller.checked.peek(), true);
});

test("controllers públicos tratam phase Release sem depender do normalizador", () => {
  const input = createInputController("");
  const checkbox = createCheckboxController(false);
  assert.equal(input.handle({ kind: "key", code: "x", phase: "Release" }), "ignored");
  assert.equal(checkbox.handle({ kind: "key", code: "Space", phase: "Release" }), "ignored");
  assert.equal(input.value.peek(), "");
  assert.equal(checkbox.checked.peek(), false);
});

test("select não renderiza quando todas as opções estão desabilitadas", () => {
  const controller = createSelectController([
    { label: "um", disabled: true },
    { label: "dois", disabled: true }
  ]);
  assert.equal(controller.selectedIndex.peek(), 0);
  assert.equal(controller.handle({ kind: "key", code: "ArrowDown" }), "consumed");
  assert.equal(controller.selectedIndex.peek(), 0);
});

test("select e tabs truncam índices inválidos e não renderizam no-op", () => {
  const select = createSelectController([{ label: "um" }, { label: "dois" }, { label: "três" }], 1.8);
  assert.equal(select.selectedIndex.peek(), 1);

  const tabs = createTabsController(3, 1.8);
  assert.equal(tabs.activeIndex.peek(), 1);
  assert.equal(tabs.handle({ kind: "key", code: "ArrowLeft", phase: "release" }), "ignored");
  assert.equal(tabs.activeIndex.peek(), 1);

  const singleTab = createTabsController(1);
  assert.equal(singleTab.handle({ kind: "key", code: "ArrowRight" }), "consumed");
  assert.equal(singleTab.activeIndex.peek(), 0);
});

test("tabs normalizam índice gravável antes de navegar", () => {
  const tabs = createTabsController(3);
  tabs.activeIndex.set(1.8);
  assert.equal(tabs.handle({ kind: "key", code: "ArrowRight" }), "render");
  assert.equal(tabs.activeIndex.peek(), 2);
});

test("signals controlados continuam recebendo Unicode pelo widget real", () => {
  const value = signal("👩‍💻a");
  const app = createSlateApp(() => Input({ id: "field", value, onChange: next => value.set(next) }), { viewport: { width: 20, height: 1 } });
  assert.equal(app.focus("field"), true);
  assert.equal(app.dispatch({ kind: "key", code: "ArrowLeft" }), "render");
  assert.equal(app.dispatch({ kind: "key", code: "x", text: "x" }), "render");
  app.flush();
  assert.equal(value.peek(), "👩‍💻xa");
});

test("captura de ponteiro entrega release ao alvo capturado e libera depois", () => {
  const events = [];
  const app = createSlateApp(Container({
    id: "root",
    width: 8,
    height: 2,
    children: Button({
      id: "drag",
      width: 8,
      capturePointer: true,
      onMouse: event => { events.push([event.action, event.target]); }
    })
  }), { viewport: { width: 8, height: 2 } });

  app.dispatch({ kind: "mouse", action: "press", button: "left", x: 2, y: 0 });
  app.dispatch({ kind: "mouse", action: "drag", button: "left", x: 20, y: 0 });
  app.dispatch({ kind: "mouse", action: "release", button: "left", x: 20, y: 0 });
  app.dispatch({ kind: "mouse", action: "drag", button: "left", x: 20, y: 0 });
  assert.deepEqual(events, [
    ["press", "drag"],
    ["drag", "drag"],
    ["release", "drag"]
  ]);
});

test("desmontar remove o foco inexistente e não deixa estado preso", () => {
  const app = createSlateApp(Input({ id: "field" }), { viewport: { width: 12, height: 1 } });
  assert.equal(app.focus("missing"), false);
  assert.equal(app.focused(), undefined);
  assert.equal(app.focus("field"), true);
  app.unmount();
  assert.equal(app.focused(), undefined);
  assert.equal(app.focus("field"), false);
});
