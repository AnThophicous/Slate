import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distribution = pathToFileURL(path.join(packageRoot, "dist", "index.js")).href;

test("renderText usa render quando um binding parcial não expõe renderText", () => {
  const script = `
    import Module from "node:module";
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      if (request === "@slate-terminal/native") return { render: options => "partial-native:" + options.text };
      if (request === "slate-node") throw new Error("fixture missing");
      return originalLoad.call(this, request, parent, isMain);
    };
    const core = await import(${JSON.stringify(distribution + "?partial-binding")});
    process.stdout.write(core.renderText("Slate"));
  `;
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: packageRoot,
    encoding: "utf8"
  });
  assert.equal(output, "partial-native:Slate");
});

test("limpa o diagnóstico de candidatos anteriores quando slate-node carrega", () => {
  const script = `
    import Module from "node:module";
    const originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      if (request === "@slate-terminal/native") throw new Error("primary fixture missing");
      if (request === "slate-node") return { render: options => "fallback-native:" + options.text };
      return originalLoad.call(this, request, parent, isMain);
    };
    const core = await import(${JSON.stringify(distribution + "?fallback-binding")});
    if (core.getNativeBindingError() !== undefined) throw new Error("stale native load error");
    process.stdout.write(core.renderText("Slate"));
  `;
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: packageRoot,
    encoding: "utf8"
  });
  assert.equal(output, "fallback-native:Slate");
});
