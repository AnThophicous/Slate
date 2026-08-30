import assert from "node:assert/strict";
import test from "node:test";
import { renderText } from "../packages/slate/dist/index.js";

test("render mantém throughput estável em uso repetido", () => {
  const start = performance.now();
  let output = "";
  for (let index = 0; index < 10000; index += 1) output = renderText(`Slate ${index}`, { foreground: "#22d3ee" });
  const elapsed = performance.now() - start;
  assert.ok(output.includes("Slate 9999"));
  assert.ok(elapsed < 5000);
});
