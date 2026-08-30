import assert from "node:assert/strict";
import test from "node:test";
import { renderText } from "../packages/slate/dist/index.js";
import { Block, Container, createSlateApp, signal } from "../packages/slate-react/dist/index.js";

test("render mantém throughput estável em uso repetido", () => {
  const start = performance.now();
  let output = "";
  for (let index = 0; index < 10000; index += 1) output = renderText(`Slate ${index}`, { foreground: "#22d3ee" });
  const elapsed = performance.now() - start;
  assert.ok(output.includes("Slate 9999"));
  assert.ok(elapsed < 5000);
});

test("signals agrupam commits de apresentação sem spam de render", async () => {
  const value = signal("0");
  let viewCalls = 0;
  let commits = 0;
  const app = createSlateApp(() => {
    viewCalls += 1;
    return Container({ id: "root", children: Block({ id: "value", text: value }) });
  }, { viewport: { width: 40, height: 4 } });
  app.subscribe(() => { commits += 1; });
  for (let index = 0; index < 10000; index += 1) value.set(String(index));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(viewCalls, 1);
  assert.equal(commits, 1);
  assert.match(app.renderAnsi({ clear: false, hideCursor: false }), /9999/);
});
