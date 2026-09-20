import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { test } from "node:test";

const loaderPath = fileURLToPath(new URL("../packages/slate-native/index.js", import.meta.url));
const loaderSource = readFileSync(loaderPath, "utf8");
const fixtureDirectory = path.join(path.dirname(loaderPath), "native-loader-fixture");
const requiredExports = [
  "clearScreen",
  "closeTerminal",
  "disableAlternateScreen",
  "disableBracketedPaste",
  "disableFocusChange",
  "disableMouseCapture",
  "disableRawMode",
  "enableAlternateScreen",
  "enableBracketedPaste",
  "enableFocusChange",
  "enableMouseCapture",
  "enableRawMode",
  "hideCursor",
  "pollEvent",
  "render",
  "renderColorShift",
  "renderGlow",
  "renderText",
  "showCursor",
  "version",
];

function createBinding(overrides = {}) {
  return Object.fromEntries(requiredExports.map((exportName) => [
    exportName,
    overrides[exportName] ?? (() => undefined),
  ]));
}

function executeLoader({
  platform = "win32",
  arch = "x64",
  existingFiles = [],
  binding = createBinding(),
  loadErrors = new Map(),
  dlopenBinding = binding,
} = {}) {
  const nativeModule = { exports: {} };
  const existingFileNames = new Set(existingFiles);
  const inspectedPaths = [];
  const loadedPaths = [];
  const fakeFileSystem = {
    statSync(candidate) {
      inspectedPaths.push(candidate);
      if (!existingFileNames.has(path.basename(candidate))) {
        const error = new Error(`missing fixture: ${path.basename(candidate)}`);
        error.code = "ENOENT";
        throw error;
      }
      return { isFile: () => true };
    },
  };
  const fakeRequire = (request) => {
    if (request === "node:path") return path;
    if (request === "node:fs") return fakeFileSystem;
    loadedPaths.push(request);
    const loadError = loadErrors.get(path.basename(request));
    if (loadError) throw loadError;
    return binding;
  };
  const fakeProcess = {
    platform,
    arch,
    dlopen(targetModule, candidate) {
      loadedPaths.push(candidate);
      const loadError = loadErrors.get(path.basename(candidate));
      if (loadError) throw loadError;
      targetModule.exports = dlopenBinding;
    },
  };
  const context = {
    __dirname: fixtureDirectory,
    module: nativeModule,
    exports: nativeModule.exports,
    process: fakeProcess,
    require: fakeRequire,
  };

  vm.runInNewContext(loaderSource, context, { filename: loaderPath });
  return { exports: nativeModule.exports, inspectedPaths, loadedPaths };
}

function captureLoaderError(options) {
  try {
    executeLoader(options);
  } catch (error) {
    return error;
  }
  assert.fail("loader should have thrown");
}

test("rejects unsupported platform and architecture before resolving files", () => {
  for (const runtime of [
    { platform: "freebsd", arch: "x64", label: "freebsd-x64" },
    { platform: "win32", arch: "ia32", label: "win32-ia32" },
  ]) {
    const error = captureLoaderError(runtime);

    assert.equal(error.code, "ERR_SLATE_NATIVE_UNSUPPORTED_PLATFORM");
    assert.match(error.message, new RegExp(runtime.label));
    assert.match(error.message, /win32-x64-msvc/);
  }
});

test("maps every declared Node target to its packaged artifact", () => {
  for (const runtime of [
    { platform: "win32", arch: "x64", artifact: "slate_node.win32-x64-msvc.node" },
    { platform: "win32", arch: "arm64", artifact: "slate_node.win32-arm64-msvc.node" },
    { platform: "linux", arch: "x64", artifact: "slate_node.linux-x64-gnu.node" },
    { platform: "linux", arch: "arm64", artifact: "slate_node.linux-arm64-gnu.node" },
    { platform: "darwin", arch: "x64", artifact: "slate_node.darwin-x64.node" },
    { platform: "darwin", arch: "arm64", artifact: "slate_node.darwin-arm64.node" },
  ]) {
    const result = executeLoader({
      platform: runtime.platform,
      arch: runtime.arch,
      existingFiles: [runtime.artifact],
    });

    assert.deepEqual(result.loadedPaths.map((candidate) => path.basename(candidate)), [runtime.artifact]);
  }
});

test("loads the target-specific packaged addon and preserves its exports", () => {
  const binding = createBinding({ version: () => "fixture-version" });
  const result = executeLoader({
    existingFiles: ["slate_node.win32-x64-msvc.node"],
    binding,
  });

  assert.strictEqual(result.exports, binding);
  assert.deepEqual(result.loadedPaths.map((candidate) => path.basename(candidate)), [
    "slate_node.win32-x64-msvc.node",
  ]);
});

test("falls back to a local source build when no packaged addon exists", () => {
  const binding = createBinding();
  const result = executeLoader({
    existingFiles: ["slate_node.dll"],
    dlopenBinding: binding,
  });

  assert.strictEqual(result.exports, binding);
  assert.deepEqual(result.loadedPaths.map((candidate) => path.basename(candidate)), ["slate_node.dll"]);
});

test("reports the target and every checked path when no addon exists", () => {
  const error = captureLoaderError({});

  assert.equal(error.code, "ERR_SLATE_NATIVE_BINARY_NOT_FOUND");
  assert.match(error.message, /win32-x64-msvc/);
  assert.match(error.message, /slate_node\.win32-x64-msvc\.node/);
  assert.match(error.message, /slate_node\.node/);
  assert.match(error.message, /slate_node\.dll/);
  assert.match(error.message, /npm run native:build/);
});

test("does not mask a load failure or continue to a different candidate", () => {
  const loadError = new Error("The specified module could not be found.");
  loadError.code = "ERR_DLOPEN_FAILED";
  const error = captureLoaderError({
    existingFiles: ["slate_node.win32-x64-msvc.node", "slate_node.dll"],
    loadErrors: new Map([["slate_node.win32-x64-msvc.node", loadError]]),
  });

  assert.equal(error.code, "ERR_SLATE_NATIVE_LOAD_FAILED");
  assert.strictEqual(error.cause, loadError);
  assert.match(error.message, /slate_node\.win32-x64-msvc\.node/);
  assert.match(error.message, /The specified module could not be found/);
  assert.doesNotMatch(error.message, /slate_node\.dll/);
});

test("rejects an addon that does not implement the lifecycle contract", () => {
  const binding = createBinding();
  delete binding.closeTerminal;
  const error = captureLoaderError({
    existingFiles: ["slate_node.win32-x64-msvc.node"],
    binding,
  });

  assert.equal(error.code, "ERR_SLATE_NATIVE_CONTRACT");
  assert.deepEqual([...error.missingExports], ["closeTerminal"]);
  assert.match(error.message, /closeTerminal/);
});

test("publishes only supported Node targets and exposes a package test command", () => {
  const packageJson = JSON.parse(readFileSync(path.join(path.dirname(loaderPath), "package.json"), "utf8"));

  assert.deepEqual(packageJson.os, ["win32", "linux", "darwin"]);
  assert.deepEqual(packageJson.cpu, ["x64", "arm64"]);
  assert.equal(packageJson.scripts.test, "node --test ../../tests/native-loader-regressions.test.mjs");
});
