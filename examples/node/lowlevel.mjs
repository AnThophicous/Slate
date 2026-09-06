/**
 * Slate 2.3.0: capacidades do terminal, console de baixo nível, cache
 * pré-aquecido e um widget de extensão.
 *
 * Rode com `node examples/node/lowlevel.mjs`. O programa desenha um quadro,
 * espera uma tecla e restaura o terminal, mesmo se a escrita falhar.
 */

import {
  Container,
  Gauge,
  KeyHint,
  StatusBar,
  Text,
  createWidget,
  describeCapabilities,
  detectTerminalCapabilities,
  openInteractiveConsole,
  prewarmSync,
  registerExtension,
  render,
  runExtensionConformance
} from "@slate-terminal/react";

// 1. O que este terminal aceita. A detecção é pura: o mesmo ambiente devolve
// sempre a mesma resposta, então a interface degrada de forma previsível.
const capabilities = detectTerminalCapabilities();

// 2. Um widget de terceiro, com o mesmo contrato dos widgets do núcleo. A
// conformidade é verificável antes de publicar a extensão.
const sparklineDefinition = {
  type: "sparkline",
  text: node => {
    const values = Array.isArray(node.props.values) ? node.props.values : [];
    const glyphs = capabilities.unicode ? "▁▂▃▄▅▆▇█" : ".:-=+*#@";
    const max = Math.max(1, ...values);
    return [values.map(value => glyphs[Math.min(glyphs.length - 1, Math.floor((value / max) * (glyphs.length - 1)))]).join("")];
  }
};
const report = runExtensionConformance({ name: "exemplo-sparkline", widgets: [sparklineDefinition] });
if (!report.passed) throw new Error(report.checks.filter(check => !check.passed).map(check => `${check.name}: ${check.detail}`).join("; "));

const extension = registerExtension({ name: "exemplo-sparkline", version: "1.0.0", widgets: [sparklineDefinition] });
const Sparkline = createWidget(sparklineDefinition);

// 3. A sessão de baixo nível: modos ligados de uma vez, com um close()
// idempotente que desfaz cada um na ordem inversa.
const terminal = openInteractiveConsole({ capabilities });
const viewport = terminal.size();

// 4. Aquecimento antes do primeiro frame: mede o texto conhecido e enche o
// buffer do viewport, para o primeiro frame não pagar por isso.
const labels = ["CPU", "Memória", "Rede", "Slate 2.3.0"];
const warmed = prewarmSync({ viewport, samples: labels });

const app = render(() => Container({
  id: "app",
  direction: "column",
  gap: 1,
  padding: 1,
  children: [
    Text({ id: "titulo", text: `Slate 2.3.0 · ${describeCapabilities(capabilities)}`, textStyle: { bold: true } }),
    Gauge({ id: "cpu", label: "CPU", value: 0.42, max: 1, size: 24 }),
    Gauge({ id: "mem", label: "Memória", value: 0.71, max: 1, size: 24 }),
    Sparkline({ id: "rede", values: [2, 5, 3, 8, 6, 9, 4, 7] }),
    Text({ id: "cache", text: `Cache aquecido: ${warmed.graphemes} grafemas, ${warmed.samples} amostras (${warmed.cacheDir ?? "sem disco"})`, textStyle: { dim: true } }),
    StatusBar({ id: "status", left: "pronto", right: capabilities.terminal }),
    KeyHint({ id: "atalhos", hints: [{ key: "qualquer tecla", label: "sair" }] })
  ]
}), { viewport });

try {
  terminal.write(app.renderAnsi({ colors: capabilities.colors, unicode: capabilities.unicode }));
  await firstKey(terminal);
} finally {
  terminal.close();
  app.close();
  extension.dispose();
}

function firstKey(handle) {
  // Sem TTY (um pipe, por exemplo) não existe tecla para esperar.
  if (process.stdin.isTTY !== true) return Promise.resolve();
  return new Promise(resolve => {
    const stop = handle.onData(() => {
      stop();
      resolve();
    });
  });
}
