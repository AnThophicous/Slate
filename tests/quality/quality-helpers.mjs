import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

export const packageDirectories = Object.freeze({
  core: "packages/slate",
  react: "packages/slate-react",
  native: "packages/slate-native"
});

export function packageDirectory(packageKey) {
  const relativeDirectory = packageDirectories[packageKey];
  if (!relativeDirectory) throw new Error("Pacote de qualidade desconhecido: " + packageKey);
  return join(repositoryRoot, relativeDirectory);
}

export function packageManifest(packageKey) {
  return JSON.parse(readFileSync(join(packageDirectory(packageKey), "package.json"), "utf8"));
}

export function compiledPackageInfo(packageKey) {
  const directory = packageDirectory(packageKey);
  const manifest = packageManifest(packageKey);
  if (typeof manifest.main !== "string" || typeof manifest.types !== "string") {
    throw new Error("Manifesto sem main/types para " + packageKey);
  }
  if (isAbsolute(manifest.main) || isAbsolute(manifest.types)) {
    throw new Error("Manifesto com caminho absoluto para " + packageKey);
  }
  return {
    directory,
    manifest,
    mainPath: resolve(directory, manifest.main),
    typesPath: resolve(directory, manifest.types)
  };
}

export function assertCompiledPackage(packageKey) {
  const info = compiledPackageInfo(packageKey);
  if (!existsSync(info.mainPath)) {
    throw new Error("Artefato compilado ausente para " + packageKey + "; execute npm run build");
  }
  if (!existsSync(info.typesPath)) {
    throw new Error("Declaração compilada ausente para " + packageKey + "; execute npm run build");
  }
  return info;
}

export async function loadCompiledPackage(packageKey) {
  const info = assertCompiledPackage(packageKey);
  return import(pathToFileURL(info.mainPath).href);
}

export function readRepositoryFile(relativePath) {
  return readFileSync(join(repositoryRoot, relativePath), "utf8");
}

export function extractFencedCodeBlocks(markdown) {
  const blocks = [];
  const lines = markdown.split(/\r?\n/);
  let fenceCharacter;
  let fenceLength = 0;
  let currentLines;

  for (const line of lines) {
    if (fenceCharacter === undefined) {
      const opening = line.match(/^\s*(\x60{3,}|~{3,})/);
      if (opening) {
        fenceCharacter = opening[1][0];
        fenceLength = opening[1].length;
        currentLines = [];
      }
      continue;
    }

    const closing = new RegExp("^\\s*" + fenceCharacter + "{" + fenceLength + ",}\\s*$");
    if (closing.test(line)) {
      blocks.push(currentLines.join("\n"));
      fenceCharacter = undefined;
      fenceLength = 0;
      currentLines = undefined;
      continue;
    }

    currentLines.push(line);
  }

  if (fenceCharacter !== undefined) throw new Error("Bloco de documentação sem fechamento");
  return blocks;
}

export function findCodeBlockContaining(markdown, requiredTokens) {
  return extractFencedCodeBlocks(markdown).find(block => requiredTokens.every(token => block.includes(token)));
}

export function runNodeScript(source) {
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  delete environment.NODE_PATH;
  return spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: environment,
    timeout: 5000,
    windowsHide: true
  });
}

export function assertProcessSucceeded(result, label) {
  if (result.error || result.status !== 0) {
    throw new Error(label + " falhou: " + redactDiagnostics(result));
  }
}

export function redactDiagnostics(result) {
  return [
    "status=" + String(result.status),
    "error=" + String(result.error?.code ?? "none"),
    "signal=" + String(result.signal ?? "none")
  ].join(" ");
}

export function createNativeFreeCoreFixture(coreInfo) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "slate-quality-"));
  const fixturePackageRoot = join(fixtureRoot, "node_modules", "@slate-terminal", "core");
  mkdirSync(fixturePackageRoot, { recursive: true });
  cpSync(join(coreInfo.directory, "dist"), join(fixturePackageRoot, "dist"), { recursive: true });
  cpSync(join(coreInfo.directory, "package.json"), join(fixturePackageRoot, "package.json"));
  return {
    root: fixtureRoot,
    entry: join(fixturePackageRoot, "dist", "index.js")
  };
}

export function removeFixture(fixture) {
  rmSync(fixture.root, { recursive: true, force: true });
}

export function npmPackDryRun(packageName) {
  if (!/^@slate-terminal\/(?:core|react|native)$/.test(packageName)) {
    throw new Error("Pacote não permitido no npm pack de qualidade");
  }
  const commandArguments = ["pack", "--dry-run", "--json", "--workspace", packageName];
  const executable = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
  const executableArguments = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm.cmd " + commandArguments.join(" ")]
    : commandArguments;
  const result = spawnSync(executable, executableArguments, {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true
  });
  assertProcessSucceeded(result, "npm pack " + packageName);
  try {
    const reports = JSON.parse(result.stdout.trim());
    const report = Array.isArray(reports) ? reports[0] : reports[packageName];
    if (!report || typeof report !== "object") throw new Error("formato inesperado");
    return report;
  } catch {
    throw new Error("npm pack " + packageName + " não retornou JSON de distribuição válido");
  }
}
