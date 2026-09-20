import test from "node:test";
import assert from "node:assert/strict";
import {
  Container,
  Image,
  LogView,
  Text,
  Video,
  clearFrameBuffer,
  createFlexLayoutEngine,
  createMediaSource,
  renderTreeToAnsi,
  resolveTree
} from "../dist/index.js";

const layoutEngine = createFlexLayoutEngine();
const frameOptions = { clear: false, hideCursor: true };

function renderFrame(view, viewport, options = frameOptions) {
  const tree = resolveTree(view);
  assert.ok(tree);
  const layout = layoutEngine.layout(tree, viewport);
  return { tree, layout, output: renderTreeToAnsi(tree, layout, viewport, options) };
}

function stripAnsi(value) {
  return value.replace(/\u001b(?:\[[0-?]*[ -\/]*[@-~]|\][^\u0007]*?(?:\u0007|\u001b\\))/gu, "");
}

function frameRows(output, height) {
  if (height <= 0) return [];
  return stripAnsi(output).split("\n").slice(-height);
}

test("viewport não finito e vazio produzem um frame seguro", () => {
  assert.doesNotThrow(() => renderTreeToAnsi(null, null, { width: Number.NaN, height: Number.POSITIVE_INFINITY }, frameOptions));
  const { output } = renderFrame(Text({ id: "empty", text: "não deve aparecer" }), { width: 0, height: 0 });
  assert.doesNotMatch(output, /não deve aparecer/);
  assert.match(output, /\u001b\[H/);
  const negative = renderFrame(Text({ id: "negative", text: "não deve aparecer" }), { width: -4, height: -2 });
  assert.doesNotMatch(negative.output, /não deve aparecer/);
});

test("texto sem wrapping respeita o clip do próprio conteúdo", () => {
  const narrow = renderFrame(Text({ id: "status", width: 3, height: 1, wrapText: false, text: "abcdef" }), { width: 8, height: 1 });
  assert.equal(frameRows(narrow.output, 1)[0], "abc     ");

  const wide = renderFrame(Text({ id: "wide", width: 1, height: 1, wrapText: false, text: "界X" }), { width: 8, height: 1 });
  assert.equal(frameRows(wide.output, 1)[0], "        ");

  const multiline = renderFrame(Text({ id: "multiline", width: 4, height: 1, wrapText: false, text: "a\nb" }), { width: 4, height: 3 });
  assert.deepEqual(frameRows(multiline.output, 3), ["a   ", "    ", "    "]);
});

test("linhas vazias preservam as posições verticais", () => {
  const { output } = renderFrame(Text({ id: "lines", width: 4, height: 3, wrapText: false, text: "a\n\nb" }), { width: 4, height: 3 });
  assert.deepEqual(frameRows(output, 3), ["a   ", "    ", "b   "]);
});

test("grapheme sem largura não altera a célula anterior ao clip", () => {
  const { output } = renderFrame(Text({ id: "mark", x: 1, width: 2, height: 1, text: "\u0301", link: "https://example.test" }), { width: 4, height: 1 });
  assert.doesNotMatch(stripAnsi(output), /\u0301/);
  assert.doesNotMatch(output, /\u001b\]8;;/);
});

test("styles e links permanecem delimitados entre runs", () => {
  const { output } = renderFrame(LogView({ id: "log", width: 30, height: 4, follow: false, lines: [{ runs: [
    { text: "A", style: { bold: true, foreground: "#ff0000" }, link: "https://a.test" },
    { text: "B", style: { underline: true }, link: "https://b.test" },
    { text: "CD" }
  ] }] }), { width: 30, height: 4 });
  assert.match(output, /\u001b\[0;1;38;2;255;0;0m/);
  assert.match(output, /\u001b\[0;4m/);
  assert.equal(output.match(/\u001b\]8;;/g)?.length, 4);
  assert.match(frameRows(output, 4)[0], /^ABCD\s+$/);
});

test("links rejeitam controles C1 antes de entrar no OSC 8", () => {
  const { output } = renderFrame(Text({ id: "unsafe-link", text: "link", link: "https://example.test/\u009cnext" }), { width: 8, height: 1 });
  assert.doesNotMatch(output, /\u001b\]8;;/);
  assert.match(frameRows(output, 1)[0], /^link    $/);
});

test("mídia só é emitida quando o nó está visível e inteiro no clip", () => {
  const source = createMediaSource(Buffer.from("png"), "image/png");
  const mediaOptions = { ...frameOptions, mediaProtocol: "iterm2" };

  const visible = renderFrame(Image({ id: "visible", width: 2, height: 1, source }), { width: 2, height: 1 }, mediaOptions);
  assert.match(visible.output, /1337;File=inline=1/);

  const hidden = renderFrame(Image({ id: "hidden", visible: false, width: 2, height: 1, source }), { width: 2, height: 1 }, mediaOptions);
  assert.doesNotMatch(hidden.output, /1337;File=inline=1/);

  const clipped = renderFrame(Container({ id: "viewport", width: 2, height: 1, overflow: "hidden", children: Image({ id: "clipped", width: 4, height: 1, source }) }), { width: 4, height: 1 }, mediaOptions);
  assert.doesNotMatch(clipped.output, /1337;File=inline=1/);
});

test("vídeo normaliza índices de frame inválidos sem perder a mídia", () => {
  const first = createMediaSource(Buffer.from("first"), "image/png");
  const second = createMediaSource(Buffer.from("second"), "image/png");
  const frame = renderFrame(Video({ id: "video", width: 2, height: 1, frames: [first, second] }), { width: 2, height: 1 }, { ...frameOptions, mediaProtocol: "iterm2", frameIndex: -1 });
  assert.match(frame.output, /Zmlyc3Q=/);
});

test("clear, cursor e viewport vazio mantêm sequências ANSI coerentes", () => {
  const tree = resolveTree(Text({ id: "text", text: "Slate" }));
  assert.ok(tree);
  const layout = layoutEngine.layout(tree, { width: 5, height: 1 });
  const noClearNoHide = renderTreeToAnsi(tree, layout, { width: 5, height: 1 }, { clear: false, hideCursor: false });
  assert.doesNotMatch(noClearNoHide, /\u001b\[2J/);
  assert.doesNotMatch(noClearNoHide, /\u001b\[\?25l/);

  const restored = renderTreeToAnsi(tree, layout, { width: 5, height: 1 }, { clear: true, hideCursor: true, restoreCursor: true, cursor: { x: 2, y: 0, visible: true } });
  assert.match(restored, /\u001b\[2J/);
  assert.match(restored, /\u001b\[\?25l/);
  assert.match(restored, /\u001b\[1;3H/);
  assert.match(restored, /\u001b\[\?25h/);
});

test("frame buffer pooled não vaza style ou link para o frame seguinte", () => {
  clearFrameBuffer();
  renderFrame(Text({ id: "styled", text: "A", foreground: "#00ff00", link: "https://example.test" }), { width: 4, height: 1 });
  const pooled = renderFrame(Text({ id: "plain", text: "B" }), { width: 4, height: 1 }).output;
  const fresh = renderFrame(Text({ id: "plain", text: "B" }), { width: 4, height: 1 }, { ...frameOptions, reuseBuffer: false }).output;
  assert.equal(pooled, fresh);
  assert.doesNotMatch(pooled, /38;2;0;255;0/);
  assert.doesNotMatch(pooled, /\u001b\]8;;/);
});
