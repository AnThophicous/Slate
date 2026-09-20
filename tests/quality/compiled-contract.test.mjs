import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  assertCompiledPackage,
  assertProcessSucceeded,
  createNativeFreeCoreFixture,
  loadCompiledPackage,
  removeFixture,
  runNodeScript
} from "./quality-helpers.mjs";

function assertFunctionExports(moduleNamespace, packageName, exportNames) {
  for (const exportName of exportNames) {
    assert.equal(typeof moduleNamespace[exportName], "function", packageName + " deve exportar " + exportName);
  }
}

async function waitForCondition(condition, timeoutInMilliseconds) {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt > timeoutInMilliseconds) {
      throw new Error("A condição headless não foi satisfeita no prazo");
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

test("os pacotes compilados expõem a superfície principal", { concurrency: false }, async () => {
  const coreInfo = assertCompiledPackage("core");
  const reactInfo = assertCompiledPackage("react");
  const core = await loadCompiledPackage("core");
  const react = await loadCompiledPackage("react");

  assertFunctionExports(core, "@slate-terminal/core", [
    "render",
    "renderText",
    "createApp",
    "createTerminalSession",
    "createInputSource",
    "createContainer",
    "createButton",
    "signal",
    "hasNativeBinding",
    "getNativeBindingError",
    "imageToAscii",
    "rasterToAscii",
    "decodeRaster",
    "loadRasterFile",
    "version"
  ]);
  assertFunctionExports(react, "@slate-terminal/react", [
    "render",
    "createSlateApp",
    "createTerminalController",
    "createInputRouter",
    "createSlateOutput",
    "Container",
    "Input",
    "Button",
    "signal",
    "createFlexLayoutEngine",
    "renderTreeToAnsi",
    "normalizeEvent",
    "createMaterialExpressivePreset",
    "createExpressiveInteraction",
    "ExpressiveSurface",
    "ExpressiveButton",
    "Dock",
    "DockItem",
    "Mosaic",
    "MosaicItem"
  ]);
  assert.equal(typeof core.VERSION, "string", "core deve exportar VERSION");
  assert.equal(typeof react.VERSION, "string", "react deve exportar VERSION");
  assert.equal(core.VERSION, coreInfo.manifest.version, "VERSION do core diverge do manifesto");
  assert.equal(react.VERSION, reactInfo.manifest.version, "VERSION do react diverge do manifesto");
});

test("controller compilado executa input e close em fonte headless", { concurrency: false }, async () => {
  const react = await loadCompiledPackage("react");
  const name = react.signal("");
  const events = [
    { kind: "key", code: "s", phase: "press" },
    null,
    { kind: "key", code: "c", modifiers: 2, phase: "press" }
  ];
  const outputFrames = [];
  let sourceCloseCalls = 0;
  let exitCalls = 0;
  let lastPollTimeout;

  const source = {
    size: () => ({ width: 32, height: 6 }),
    poll: timeoutInMilliseconds => {
      lastPollTimeout = timeoutInMilliseconds;
      return events.length > 0 ? events.shift() : null;
    },
    close: () => {
      sourceCloseCalls += 1;
    }
  };
  const app = react.render(() => react.Container({
    id: "app",
    direction: "column",
    children: [
      react.Input({ id: "name", value: name, onChange: value => name.set(String(value)) }),
      react.Text({ id: "value", text: name })
    ]
  }), { viewport: { width: 32, height: 6 }, frameRate: 0 });

  assert.equal(app.focus("name"), true, "o input headless deve aceitar foco");

  const terminal = react.createTerminalController(
    app,
    source,
    { write: frame => outputFrames.push(frame) },
    { intervalMs: 2, render: { clear: false, hideCursor: false }, onExit: () => { exitCalls += 1; } }
  );

  terminal.start();
  await waitForCondition(() => exitCalls === 1, 1000);
  terminal.close();

  assert.equal(name.peek(), "s", "o evento de teclado deve atualizar o estado");
  assert.equal(sourceCloseCalls, 1, "close deve liberar a fonte exatamente uma vez");
  assert.equal(terminal.running(), false, "controller encerrado não pode continuar polling");
  assert.equal(app.getTree(), null, "close deve desmontar a árvore");
  assert.equal(terminal.error(), undefined, "fluxo headless esperado não deve registrar erro");
  assert.ok(outputFrames.length > 0, "start deve escrever ao menos o primeiro frame");
  assert.equal(typeof lastPollTimeout, "number", "controller deve fornecer timeout numérico à fonte");
});

test("core compilado usa fallback quando nenhum addon native está instalado", { concurrency: false }, () => {
  const coreInfo = assertCompiledPackage("core");
  const fixture = createNativeFreeCoreFixture(coreInfo);
  const moduleUrl = pathToFileURL(fixture.entry).href;
  const source = [
    "const core = await import(" + JSON.stringify(moduleUrl) + ");",
    "const rendered = core.renderText('quality-headless');",
    "process.stdout.write(JSON.stringify({ native: core.hasNativeBinding(), version: core.version(), hasText: rendered.includes('quality-headless'), loadedNative: process.moduleLoadList.filter(item => /slate_node/i.test(item)) }));"
  ].join("\n");

  try {
    const result = runNodeScript(source);
    assertProcessSucceeded(result, "fallback sem native");
    const observed = JSON.parse(result.stdout.trim());
    assert.equal(observed.native, false, "nenhum binding native deve ser carregado no fixture isolado");
    assert.equal(observed.hasText, true, "fallback compilado deve renderizar texto");
    assert.deepEqual(observed.loadedNative, [], "o processo headless não deve carregar slate_node");
    assert.equal(observed.version, coreInfo.manifest.version, "fallback deve preservar a versão publicada");
  } finally {
    removeFixture(fixture);
  }
});
