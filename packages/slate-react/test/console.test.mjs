import test from "node:test";
import assert from "node:assert/strict";
import { ANSI, openConsole, openInteractiveConsole } from "../dist/index.js";

const ESC = "\u001b";

function fakeStream(size = { columns: 100, rows: 30 }) {
  const chunks = [];
  const listeners = new Map();
  return {
    chunks,
    listeners,
    isTTY: true,
    columns: size.columns,
    rows: size.rows,
    write(chunk) {
      chunks.push(chunk);
      return true;
    },
    on(event, listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    },
    off(event, listener) {
      listeners.set(event, (listeners.get(event) ?? []).filter(entry => entry !== listener));
    },
    emit(event, ...args) {
      for (const listener of listeners.get(event) ?? []) listener(...args);
    },
    output() {
      return chunks.join("");
    }
  };
}

function fakeInput() {
  const stream = fakeStream();
  const modes = [];
  return Object.assign(stream, {
    modes,
    setRawMode(mode) {
      modes.push(mode);
      return this;
    }
  });
}

test("as sequências são construídas sem tocar em nenhum stream", () => {
  assert.equal(ANSI.cursorTo(0, 0), `${ESC}[1;1H`);
  assert.equal(ANSI.cursorTo(4, 2), `${ESC}[3;5H`);
  assert.equal(ANSI.clear("after"), `${ESC}[0J`);
  assert.equal(ANSI.alternateScreen(true), `${ESC}[?1049h`);
  assert.equal(ANSI.alternateScreen(false), `${ESC}[?1049l`);
  assert.equal(ANSI.hideCursor, `${ESC}[?25l`);
  assert.equal(ANSI.title("app\u0007malicioso"), `${ESC}]0;appmalicioso\u0007`, "o título não carrega bytes de controle");
});

test("write e csi vão direto para o stream", () => {
  const output = fakeStream();
  const handle = openConsole({ output, restoreOnExit: false });
  handle.write("texto");
  handle.csi("2J", "H");
  assert.equal(output.output(), `texto${ESC}[2J${ESC}[H`);
  handle.close();
});

test("close restaura os modos na ordem inversa e é idempotente", () => {
  const output = fakeStream();
  const input = fakeInput();
  const handle = openConsole({ output, input, restoreOnExit: false });
  handle.rawMode(true);
  handle.alternateScreen(true);
  handle.mouse(true);
  handle.hideCursor();
  output.chunks.length = 0;
  handle.close();
  const restored = output.output();
  const order = [restored.indexOf(`${ESC}[?25h`), restored.indexOf(`${ESC}[?1000l`), restored.indexOf(`${ESC}[?1049l`)];
  assert.ok(order[0] >= 0 && order[1] >= 0 && order[2] >= 0, `restaurações ausentes: ${JSON.stringify(restored)}`);
  assert.ok(order[0] < order[1] && order[1] < order[2], "a restauração segue a ordem inversa");
  assert.deepEqual(input.modes, [true, false]);
  const afterClose = output.chunks.length;
  handle.close();
  handle.write("depois do close");
  assert.equal(output.chunks.length, afterClose, "nada é escrito depois do close");
  assert.equal(handle.isOpen(), false);
});

test("a sessão interativa liga os modos que o terminal aceita", () => {
  const output = fakeStream();
  const input = fakeInput();
  const handle = openInteractiveConsole({
    output,
    input,
    restoreOnExit: false,
    capabilities: { mouse: true, bracketedPaste: true, focusReports: true, alternateScreen: true }
  });
  const written = output.output();
  assert.match(written, /\u001b\[\?1049h/);
  assert.match(written, /\u001b\[\?1000h/);
  assert.match(written, /\u001b\[\?2004h/);
  assert.match(written, /\u001b\[\?1004h/);
  assert.equal(input.modes[0], true);
  handle.close();
  assert.equal(input.modes.at(-1), false);
});

test("um terminal sem mouse não recebe a sequência de mouse", () => {
  const output = fakeStream();
  const handle = openInteractiveConsole({
    output,
    input: fakeInput(),
    restoreOnExit: false,
    capabilities: { mouse: false, bracketedPaste: false, focusReports: false, alternateScreen: true }
  });
  const written = output.output();
  assert.doesNotMatch(written, /\u001b\[\?1000h/);
  assert.match(written, /\u001b\[\?1049h/);
  handle.close();
});

test("size e onResize leem o tamanho do stream", () => {
  const output = fakeStream({ columns: 120, rows: 40 });
  const handle = openConsole({ output, restoreOnExit: false });
  assert.deepEqual(handle.size(), { width: 120, height: 40 });
  const sizes = [];
  const unsubscribe = handle.onResize(viewport => sizes.push(viewport));
  output.emit("resize");
  unsubscribe();
  output.emit("resize");
  assert.deepEqual(sizes, [{ width: 120, height: 40 }]);
  handle.close();
});

test("size cai no viewport declarado quando o stream não informa tamanho", () => {
  const output = { write: () => true };
  const handle = openConsole({ output, viewport: { width: 60, height: 20 }, restoreOnExit: false });
  assert.deepEqual(handle.size(), { width: 60, height: 20 });
  handle.close();
});

test("onData entrega os pedaços crus da entrada", () => {
  const input = fakeInput();
  const handle = openConsole({ output: fakeStream(), input, restoreOnExit: false });
  const chunks = [];
  handle.onData(chunk => chunks.push(chunk));
  input.emit("data", "abc");
  handle.close();
  input.emit("data", "depois");
  assert.deepEqual(chunks, ["abc"]);
});

test("um stream que falha na escrita não derruba o handle", () => {
  const handle = openConsole({
    output: {
      write() {
        throw new Error("EPIPE");
      }
    },
    restoreOnExit: false
  });
  assert.doesNotThrow(() => handle.write("x"));
  assert.doesNotThrow(() => handle.close());
});
