import test from "node:test";
import assert from "node:assert/strict";
import { createSlateApp, resolveTree } from "../dist/index.js";
import {
  createExpressiveInteraction,
  createMaterialExpressivePreset,
  sanitizeExpressiveId
} from "../dist/material-expressive.js";

test("preset expõe tokens M3-inspired seguros para terminal", () => {
  const preset = createMaterialExpressivePreset({
    colors: { primary: "#ABC", outlineVariant: "invalid" },
    spacing: { md: 7, custom: 9.9 },
    shapes: { square: { style: "heavy", color: "invalid" } },
    motion: { hover: null, focus: { kind: "glow", color: "#0f0", radius: 99, intensity: 4, speed: -1 } }
  });

  assert.equal(preset.tokens.colors.primary, "#aabbcc");
  assert.equal(preset.tokens.colors.outlineVariant, "#45464f");
  assert.equal(preset.tokens.spacing.md, 7);
  assert.equal(preset.tokens.spacing.custom, 9);
  assert.equal(preset.tokens.shapes.square.style, "heavy");
  assert.equal(preset.tokens.shapes.square.color, preset.tokens.colors.outlineVariant);
  assert.equal(preset.tokens.motion.hover, undefined);
  assert.equal(preset.tokens.motion.focus.radius, 32);
  assert.equal(preset.tokens.motion.focus.intensity, 1);
  assert.equal(preset.tokens.motion.focus.speed, 0);
  assert.ok(Object.isFrozen(preset.tokens));
});

test("estilos permitem trocar role, shape, borda e effect sem React", () => {
  const preset = createMaterialExpressivePreset();
  const effect = { kind: "glow", color: "#ABC", radius: 4, intensity: 0.8, speed: 3 };
  const button = preset.buttonStyle({ role: "tertiary", shape: "heavy", effect });
  const surface = preset.surfaceStyle({ tone: "surfaceVariant", shape: "square", border: false });

  assert.equal(button.background, preset.tokens.colors.tertiary);
  assert.equal(button.foreground, preset.tokens.colors.onTertiary);
  assert.equal(button.border.style, "heavy");
  assert.equal(button.effect.color, "#aabbcc");
  assert.equal(surface.background, preset.tokens.colors.surfaceVariant);
  assert.equal(surface.border, false);
  assert.equal(preset.border("double", "#123").style, "double");
});

test("IDs e texto são determinísticos e não carregam controles ANSI", () => {
  const preset = createMaterialExpressivePreset();
  const first = resolveTree(preset.surface({ id: "  \u001b[31mcard/one\t", children: "\u001b[32mOlá" }));
  const second = resolveTree(preset.surface({ id: "  \u001b[31mcard/one\t", children: "\u001b[32mOlá" }));

  assert.equal(sanitizeExpressiveId("  \u001b[31mcard/one\t"), "card-one");
  assert.equal(first?.id, "card-one");
  assert.equal(second?.id, first?.id);
  assert.equal(first?.children[0]?.props.text, "Olá");
});

test("hover, focus, press e release mudam a apresentação via signals e handlers Slate", () => {
  const preset = createMaterialExpressivePreset();
  const interaction = createExpressiveInteraction();
  let presses = 0;
  const view = preset.button({
    id: "save",
    interaction,
    children: "Salvar",
    onPress: () => { presses += 1; return "render"; }
  });
  const app = createSlateApp(view, { autoMount: false, viewport: { width: 24, height: 6 } });
  app.mount();

  app.dispatch({ kind: "mouse", action: "move", x: 1, y: 1 });
  app.flush();
  assert.equal(interaction.hovered.peek(), true);
  assert.equal(app.getTree()?.props.background, preset.tokens.colors.primaryContainer);
  assert.equal(app.getTree()?.props.effect.kind, "glow");

  app.dispatch({ kind: "mouse", action: "press", button: "left", x: 1, y: 1 });
  app.flush();
  assert.equal(interaction.focused.peek(), true);
  assert.equal(interaction.pressed.peek(), true);
  assert.equal(presses, 1);
  assert.equal(app.getTree()?.props.background, preset.tokens.colors.primaryContainer);
  assert.equal(app.getTree()?.props.border.style, "double");
  assert.equal(app.getTree()?.props.effect.kind, "colorShift");

  app.dispatch({ kind: "mouse", action: "release", button: "left", x: 1, y: 1 });
  app.flush();
  assert.equal(interaction.pressed.peek(), false);
  assert.equal(app.getTree()?.props.border.style, "heavy");

  app.dispatch({ kind: "mouse", action: "move", x: 30, y: 7 });
  app.flush();
  assert.equal(interaction.hovered.peek(), false);
  app.blur();
  app.flush();
  assert.equal(app.getTree()?.props.background, preset.tokens.colors.primary);
  app.close();
});

test("override de estado pode remover animação e trocar shape", () => {
  const preset = createMaterialExpressivePreset();
  const interaction = createExpressiveInteraction({ hovered: true });
  const app = createSlateApp(preset.button({
    id: "free",
    interaction,
    children: "Livre",
    states: { hover: { background: "#ABC", shape: "square", effect: null } }
  }), { autoMount: false, viewport: { width: 20, height: 4 } });
  app.mount();

  assert.equal(app.getTree()?.props.background, "#aabbcc");
  assert.equal(app.getTree()?.props.border.style, "single");
  assert.equal(app.getTree()?.props.effect, undefined);
  app.close();
});

test("border false permanece sem borda durante hover", () => {
  const preset = createMaterialExpressivePreset();
  const interaction = createExpressiveInteraction({ hovered: true });
  const app = createSlateApp(preset.button({
    id: "plain",
    border: false,
    interaction,
    children: "Plain"
  }), { autoMount: false, viewport: { width: 20, height: 4 } });
  app.mount();
  assert.equal(app.getTree()?.props.border, false);
  app.close();
});
