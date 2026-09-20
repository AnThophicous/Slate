import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  assertCompiledPackage,
  findCodeBlockContaining,
  loadCompiledPackage,
  npmPackDryRun,
  packageDirectory,
  packageManifest,
  readRepositoryFile
} from "./quality-helpers.mjs";

const packageContracts = [
  {
    key: "core",
    name: "@slate-terminal/core",
    expectedPackFiles: ["dist/index.js", "dist/index.d.ts", "README.md"]
  },
  {
    key: "react",
    name: "@slate-terminal/react",
    expectedPackFiles: ["dist/index.js", "dist/index.d.ts", "README.md"]
  },
  {
    key: "native",
    name: "@slate-terminal/native",
    expectedPackFiles: ["index.js", "index.d.ts", "README.md"]
  }
];

test("manifestos mantêm versão, entrypoints e paths públicos compilados", { concurrency: false }, () => {
  const rootVersion = JSON.parse(readRepositoryFile("package.json")).version;

  for (const contract of packageContracts) {
    const info = assertCompiledPackage(contract.key);
    assert.equal(info.manifest.name, contract.name, "nome do pacote diverge: " + contract.key);
    assert.equal(info.manifest.version, rootVersion, "versão diverge do workspace: " + contract.key);
    assert.equal(info.manifest.files.includes("README.md"), true, "README ausente no pacote: " + contract.key);
    assert.equal(info.manifest.main.startsWith("./"), true, "main deve ser relativo: " + contract.key);
    assert.equal(info.manifest.types.startsWith("./"), true, "types deve ser relativo: " + contract.key);
    assert.equal(info.manifest.main.includes(".."), false, "main não pode escapar do pacote: " + contract.key);
    assert.equal(info.manifest.types.includes(".."), false, "types não pode escapar do pacote: " + contract.key);

    for (const [exportPath, exportTarget] of Object.entries(info.manifest.exports ?? {})) {
      for (const field of ["import", "default", "types"]) {
        const target = exportTarget?.[field];
        if (typeof target !== "string" || !target.startsWith("./")) continue;
        assert.equal(
          existsSync(join(packageDirectory(contract.key), target)),
          true,
          "path de export ausente em " + contract.key + ": " + exportPath + "/" + field
        );
      }
    }
  }
});

test("npm pack dry-run contém apenas entrypoints de distribuição esperados", { concurrency: false }, () => {
  for (const contract of packageContracts) {
    const manifest = packageManifest(contract.key);
    const report = npmPackDryRun(contract.name);
    const filePaths = new Set((report.files ?? []).map(file => file.path));

    assert.equal(report.name, contract.name, "npm pack retornou pacote inesperado: " + contract.key);
    assert.equal(report.version, manifest.version, "npm pack retornou versão inesperada: " + contract.key);
    for (const expectedPath of contract.expectedPackFiles) {
      assert.equal(filePaths.has(expectedPath), true, "arquivo de distribuição ausente: " + contract.key + "/" + expectedPath);
    }
    for (const filePath of filePaths) {
      assert.equal(/^(src|test|tests|target)(\/|$)/.test(filePath), false, "pacote publicou arquivo de desenvolvimento: " + contract.key);
    }
  }
});

test("snippets interativos completos continuam alinhados com os exports compilados", { concurrency: false }, async () => {
  const core = await loadCompiledPackage("core");
  const react = await loadCompiledPackage("react");
  assert.equal(typeof core.createTerminalSession, "function", "core compilado não expõe createTerminalSession");
  assert.equal(typeof react.createTerminalController, "function", "react compilado não expõe createTerminalController");
  assert.equal(typeof react.createSlateOutput, "function", "react compilado não expõe createSlateOutput");

  const snippets = [
    {
      path: "packages/slate-react/README.md",
      tokens: ["createTerminalController", "terminal.start()", "terminal.close()"]
    },
    {
      path: "docs/guide.md",
      tokens: ["createTerminalSession", "createTerminalController", "terminal.start()", "terminal.close()"]
    }
  ];

  for (const snippet of snippets) {
    const block = findCodeBlockContaining(readRepositoryFile(snippet.path), snippet.tokens);
    assert.ok(block, "snippet interativo incompleto ou ausente: " + snippet.path);
  }
});
