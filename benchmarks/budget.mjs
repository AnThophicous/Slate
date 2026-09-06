/**
 * Frame budget check.
 *
 * `compare.mjs` reports numbers; this script fails when they regress. Each
 * scenario has a declared budget in `budget.json`, expressed as microseconds
 * per iteration, and CI runs it as a gate. Machines differ, so the budgets
 * carry deliberate headroom and `SLATE_BUDGET_SCALE` widens them further for a
 * slower runner instead of asking anyone to edit the file.
 */

import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import {
  Block,
  Container,
  Text,
  clearFrameBuffer,
  clearTextCaches,
  createSlateApp,
  prewarmSync
} from "../packages/slate-react/dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const budgets = JSON.parse(readFileSync(join(here, "budget.json"), "utf8"));
const scale = Number(process.env.SLATE_BUDGET_SCALE ?? 1) || 1;
const iterations = Number(process.env.SLATE_BUDGET_ITERATIONS ?? 2000);
const wideIterations = Math.max(20, Math.floor(iterations / 20));
const viewport = { width: 100, height: 30 };
const labels = Array.from({ length: 24 }, (_value, index) => `Linha ${index} com acento e emoji 🙂`);

const sink = nullStream();

const small = createSlateApp(() => Container({ id: "root", direction: "row", children: [
  Block({ id: "left", text: "Slate", flexGrow: 1 }),
  Block({ id: "right", text: "Mosaic", flexGrow: 1 })
] }), { viewport, autoMount: false });

const large = createSlateApp(() => Container({
  id: "root",
  direction: "column",
  children: Array.from({ length: 500 }, (_value, index) => Text({ id: `item:${index}`, text: `item ${index}`, foreground: index % 2 === 0 ? "#38bdf8" : "#f8fafc" }))
}), { viewport, autoMount: false });

const results = [
  run("reconcile", iterations, () => {
    small.render();
  }),
  run("frame", iterations, () => {
    small.render();
    sink.write(small.renderAnsi({ clear: false, hideCursor: true }));
  }),
  run("static-tree", wideIterations, () => {
    large.render();
  }),
  run("frame-wide", wideIterations, () => {
    large.render();
    sink.write(large.renderAnsi({ clear: false, hideCursor: true }));
  })
];

const cold = firstFrame({ warm: false });
const warm = firstFrame({ warm: true });
console.log(JSON.stringify({ scenario: "first-frame", coldMs: round(cold), warmMs: round(warm), warmShare: round(cold === 0 ? 0 : warm / cold) }));

let failed = 0;
for (const result of results) {
  const budget = budgets[result.scenario];
  const limit = budget === undefined ? undefined : budget * scale;
  const ok = limit === undefined || result.microseconds <= limit;
  if (!ok) failed += 1;
  console.log(JSON.stringify({ ...result, budgetMicroseconds: limit ?? null, ok }));
}

small.close();
large.close();

if (failed > 0) {
  console.error(`${failed} cenário(s) acima do orçamento de frame.`);
  process.exit(1);
}

function run(scenario, count, body) {
  for (let index = 0; index < Math.min(count, 50); index += 1) body();
  const start = performance.now();
  for (let index = 0; index < count; index += 1) body();
  const elapsed = performance.now() - start;
  return { scenario, iterations: count, milliseconds: round(elapsed), microseconds: round((elapsed / count) * 1000) };
}

/** Measures the very first frame of a fresh application, warm and cold. */
function firstFrame({ warm }) {
  clearTextCaches();
  clearFrameBuffer();
  if (warm) prewarmSync({ viewport, samples: labels, cache: false });
  const app = createSlateApp(() => Container({
    id: "root",
    direction: "column",
    children: labels.map((label, index) => Text({ id: `row:${index}`, text: label, foreground: "#38bdf8" }))
  }), { viewport, autoMount: false });
  const start = performance.now();
  app.render();
  app.renderAnsi({ clear: false, hideCursor: true });
  const elapsed = performance.now() - start;
  app.close();
  return elapsed;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function nullStream() {
  const stream = new PassThrough();
  stream.resume();
  return stream;
}
