import test from "node:test";
import assert from "node:assert/strict";
import {
  Container,
  Text,
  ansi256Index,
  ansiBasicIndex,
  capabilityMatrix,
  colorParameters,
  createFlexLayoutEngine,
  describeCapabilities,
  detectTerminalCapabilities,
  renderTreeToAnsi,
  resolveTree
} from "../dist/index.js";

const viewport = { width: 20, height: 3 };

function frame(options) {
  const tree = resolveTree(Container({ id: "root", border: true, children: [Text({ id: "t", text: "oi", foreground: "#3b82f6" })] }));
  const layout = createFlexLayoutEngine().layout(tree, viewport);
  return renderTreeToAnsi(tree, layout, viewport, options);
}

test("Windows Terminal é detectado com truecolor e unicode", () => {
  const capabilities = detectTerminalCapabilities({ platform: "win32", env: { WT_SESSION: "1" }, isTty: true });
  assert.equal(capabilities.terminal, "windows-terminal");
  assert.equal(capabilities.colors, "truecolor");
  assert.equal(capabilities.unicode, true);
  assert.equal(capabilities.virtualTerminal, true);
});

test("o console legado do Windows degrada para 256 cores e ASCII", () => {
  const capabilities = detectTerminalCapabilities({ platform: "win32", env: {}, isTty: true });
  assert.equal(capabilities.terminal, "conhost");
  assert.equal(capabilities.colors, "256");
  assert.equal(capabilities.unicode, false);
  assert.equal(capabilities.wideGlyphs, false);
});

test("kitty e iTerm2 anunciam protocolo de imagem", () => {
  assert.equal(detectTerminalCapabilities({ platform: "linux", env: { TERM: "xterm-kitty" }, isTty: true }).images, "kitty");
  assert.equal(detectTerminalCapabilities({ platform: "darwin", env: { TERM_PROGRAM: "iTerm.app" }, isTty: true }).images, "iterm2");
  assert.equal(detectTerminalCapabilities({ platform: "linux", env: { TERM: "xterm-256color" }, isTty: true }).images, "none");
});

test("NO_COLOR, TERM=dumb e saída sem tty desligam a cor", () => {
  assert.equal(detectTerminalCapabilities({ env: { NO_COLOR: "1" }, isTty: true }).colors, "none");
  assert.equal(detectTerminalCapabilities({ env: { TERM: "dumb" }, isTty: true }).colors, "none");
  assert.equal(detectTerminalCapabilities({ env: {}, isTty: false }).colors, "none");
  assert.equal(detectTerminalCapabilities({ env: { FORCE_COLOR: "3" }, isTty: false }).colors, "truecolor");
});

test("a matriz cobre as três plataformas e descreve o fallback", () => {
  const matrix = capabilityMatrix();
  const names = matrix.map(profile => profile.terminal);
  assert.ok(names.includes("conhost"));
  assert.ok(names.includes("windows-terminal"));
  assert.ok(names.includes("kitty"));
  const fallback = matrix.find(profile => profile.terminal === "unknown");
  assert.equal(fallback.colors, "basic");
  for (const platform of ["win32", "darwin", "linux"]) {
    assert.ok(matrix.some(profile => profile.platforms.includes(platform)), `sem perfil para ${platform}`);
  }
  assert.match(describeCapabilities(detectTerminalCapabilities({ env: {}, isTty: true })), /cores=/);
});

test("a cor é reduzida ao que o terminal aceita", () => {
  assert.equal(colorParameters("#3b82f6", "truecolor", "foreground"), "38;2;59;130;246");
  assert.equal(colorParameters("#3b82f6", "256", "foreground"), `38;5;${ansi256Index([59, 130, 246])}`);
  assert.equal(colorParameters("#3b82f6", "none", "foreground"), undefined);
  const [code, bright] = ansiBasicIndex([59, 130, 246]);
  assert.equal(colorParameters("#3b82f6", "basic", "background"), String(40 + code + (bright ? 60 : 0)));
  assert.equal(ansi256Index([128, 128, 128]) >= 232, true, "cinza usa a rampa de cinzas");
});

test("o renderer emite truecolor por padrão e degrada quando pedido", () => {
  assert.match(frame({}), /38;2;59;130;246/);
  assert.match(frame({ colors: "256" }), /38;5;\d+/);
  assert.doesNotMatch(frame({ colors: "256" }), /38;2;/);
  assert.doesNotMatch(frame({ colors: "none" }), /38;[25];/);
});

test("sem unicode as bordas viram ASCII", () => {
  const unicodeFrame = frame({});
  const asciiFrame = frame({ capabilities: detectTerminalCapabilities({ platform: "win32", env: {}, isTty: true }) });
  assert.match(unicodeFrame, /┌/);
  assert.doesNotMatch(asciiFrame, /┌/);
  assert.match(asciiFrame, /\+-/);
});
