import { performance } from "node:perf_hooks";
import { Block, Container, createSlateApp } from "../packages/slate-react/dist/index.js";

const iterations = Number(process.env.SLATE_BENCHMARK_ITERATIONS ?? 10000);
const app = createSlateApp(() => Container({ id: "root", direction: "row", children: [
  Block({ id: "left", text: "Slate", flexGrow: 1 }),
  Block({ id: "right", text: "Mosaic", flexGrow: 1 })
] }), { viewport: { width: 80, height: 24 }, autoMount: false });
const start = performance.now();
for (let index = 0; index < iterations; index += 1) app.render();
const elapsed = performance.now() - start;
console.log(JSON.stringify({ engine: "slate", iterations, milliseconds: Number(elapsed.toFixed(3)), rendersPerSecond: Math.round(iterations / Math.max(elapsed / 1000, 0.000001)) }));

try {
  const ink = await import("ink");
  console.log(JSON.stringify({ engine: "ink", available: Boolean(ink.render) }));
} catch {
  console.log(JSON.stringify({ engine: "ink", available: false }));
}
