import { PassThrough } from "node:stream";
import { performance } from "node:perf_hooks";
import { Block, Container, createSlateApp } from "../packages/slate-react/dist/index.js";

const iterations = Number(process.env.SLATE_BENCHMARK_ITERATIONS ?? 10000);
const viewport = { width: 80, height: 24 };

const app = createSlateApp(() => Container({ id: "root", direction: "row", children: [
  Block({ id: "left", text: "Slate", flexGrow: 1 }),
  Block({ id: "right", text: "Mosaic", flexGrow: 1 })
] }), { viewport, autoMount: false });

report("slate", "reconcile", measure(() => { app.render(); }));

const slateSink = nullStream();
report("slate", "frame", measure(() => {
  app.render();
  slateSink.write(app.renderAnsi({ clear: false, hideCursor: true }));
}));

// Ink is never a dependency of Slate. Point SLATE_BENCHMARK_INK at an Ink
// entry point (and SLATE_BENCHMARK_REACT at the React copy Ink itself loads,
// otherwise the two disagree about which React owns the elements) to measure
// the same two-column tree on both engines.
const inkSpecifier = process.env.SLATE_BENCHMARK_INK ?? "ink";
const reactSpecifier = process.env.SLATE_BENCHMARK_REACT ?? "react";
let ink;
let react;
try {
  ink = await import(inkSpecifier);
  react = await import(reactSpecifier);
} catch (error) {
  console.log(JSON.stringify({ engine: "ink", available: false, reason: String(error?.message ?? error) }));
}

if (ink && react) {
  const createElement = react.createElement ?? react.default.createElement;
  const { render, Box, Text } = ink.default ?? ink;
  const stdout = Object.assign(nullStream(), { columns: viewport.width, rows: viewport.height });
  const stdin = Object.assign(new PassThrough(), { isTTY: false, setRawMode() {}, ref() {}, unref() {} });
  const view = () => createElement(Box, { flexDirection: "row" },
    createElement(Text, null, "Slate"),
    createElement(Text, null, "Mosaic"));
  const instance = render(view(), { stdout, stdin, patchConsole: false, exitOnCtrlC: false });
  try {
    report("ink", "frame", measure(() => { instance.rerender(view()); }));
  } finally {
    instance.unmount();
  }
}

function nullStream() {
  const stream = new PassThrough();
  stream.resume();
  return stream;
}

function measure(run) {
  run();
  const start = performance.now();
  for (let index = 0; index < iterations; index += 1) run();
  return performance.now() - start;
}

function report(engine, scenario, elapsed) {
  console.log(JSON.stringify({
    engine,
    scenario,
    available: true,
    iterations,
    milliseconds: Number(elapsed.toFixed(3)),
    rendersPerSecond: Math.round(iterations / Math.max(elapsed / 1000, 0.000001))
  }));
}
