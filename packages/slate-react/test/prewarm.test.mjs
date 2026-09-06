import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  Container,
  Text,
  clearFrameBuffer,
  clearTextCaches,
  createFlexLayoutEngine,
  openDiskCache,
  prewarm,
  prewarmSync,
  recordPrewarmSamples,
  renderTreeToAnsi,
  resolveTree,
  textCacheStats
} from "../dist/index.js";

const viewport = { width: 40, height: 8 };

function scratchRoot() {
  return mkdtempSync(join(tmpdir(), "slate-prewarm-test-"));
}

function frame(options = {}) {
  const tree = resolveTree(Container({
    id: "root",
    direction: "column",
    children: [
      Text({ id: "a", text: "Configurações do Slate", foreground: "#3b82f6" }),
      Text({ id: "b", text: "linha com emoji 🙂 e CJK 中文" })
    ]
  }));
  const layout = createFlexLayoutEngine().layout(tree, viewport);
  return renderTreeToAnsi(tree, layout, viewport, options);
}

test("prewarmSync aquece as medições e persiste as amostras no cache", () => {
  const dir = scratchRoot();
  try {
    clearTextCaches();
    const cache = openDiskCache({ dir });
    const result = prewarmSync({ viewport, samples: ["Salvar", "Cancelar"], cache });
    assert.ok(result.graphemes > 0, "nenhum grafema aquecido");
    assert.equal(result.samples, 2);
    assert.equal(result.frames, 1);
    assert.equal(result.cancelled, false);
    assert.equal(result.persisted, true);
    assert.equal(result.cacheDir, dir);
    assert.equal(readdirSync(join(dir, "entries")).length, 1, "as amostras usam uma única entrada");

    const reread = prewarmSync({ viewport, cache: openDiskCache({ dir }) });
    assert.ok(reread.samples >= 2, "a execução seguinte reaproveita as amostras gravadas");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("o aquecimento deixa as medições em cache para o primeiro frame", () => {
  clearTextCaches();
  prewarmSync({ viewport, samples: ["Configurações do Slate"], cache: false });
  const warmed = textCacheStats();
  assert.ok(warmed.widths.entries > 0);
  assert.ok(warmed.wraps.entries > 0);
  const before = textCacheStats().widths.hits;
  frame();
  assert.ok(textCacheStats().widths.hits > before, "o frame reaproveitou larguras já medidas");
});

test("o cache de texto não muda a saída", () => {
  clearTextCaches();
  const cold = frame();
  const warm = frame();
  clearTextCaches();
  const afterClear = frame();
  assert.equal(cold, warm);
  assert.equal(cold, afterClear);
});

test("o buffer reaproveitado produz o mesmo frame que um buffer novo", () => {
  clearFrameBuffer();
  const pooled = frame();
  const fresh = frame({ reuseBuffer: false });
  const pooledAgain = frame();
  assert.equal(pooled, fresh);
  assert.equal(pooled, pooledAgain);
});

test("o frame anterior não vaza para o próximo através do buffer", () => {
  const longer = resolveTree(Container({ id: "root", children: [Text({ id: "a", text: "AAAAAAAAAAAAAAAAAAAA" })] }));
  const shorter = resolveTree(Container({ id: "root", children: [Text({ id: "a", text: "B" })] }));
  const engine = createFlexLayoutEngine();
  renderTreeToAnsi(longer, engine.layout(longer, viewport), viewport);
  const output = renderTreeToAnsi(shorter, engine.layout(shorter, viewport), viewport);
  assert.doesNotMatch(output, /A/, "o texto do frame anterior foi apagado");
  assert.match(output, /B/);
});

test("prewarm assíncrono respeita o orçamento e o sinal de cancelamento", async () => {
  const byBudget = await prewarm({ viewport, samples: ["a", "b", "c"], cache: false, budgetMs: 0 });
  assert.equal(byBudget.cancelled, true);
  assert.equal(byBudget.persisted, false);

  const bySignal = await prewarm({ viewport, samples: ["a"], cache: false, budgetMs: 1000, signal: { aborted: true } });
  assert.equal(bySignal.cancelled, true);

  const complete = await prewarm({ viewport, samples: ["Salvar"], cache: false, budgetMs: 5000 });
  assert.equal(complete.cancelled, false);
  assert.ok(complete.graphemes > 0);
  assert.equal(complete.frames, 1);
});

test("um aquecimento cancelado não grava amostras no disco", async () => {
  const dir = scratchRoot();
  try {
    const cache = openDiskCache({ dir });
    const result = await prewarm({ viewport, samples: ["x"], cache, budgetMs: 0 });
    assert.equal(result.cancelled, true);
    assert.equal(existsSync(join(dir, "entries")) ? readdirSync(join(dir, "entries")).length : 0, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("recordPrewarmSamples alimenta o próximo aquecimento", () => {
  recordPrewarmSamples(["Etiqueta registrada"]);
  const result = prewarmSync({ viewport, cache: false });
  assert.ok(result.samples >= 1);
});
