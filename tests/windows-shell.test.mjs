import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const fixture = fileURLToPath(new URL("./windows-shell-fixture.mjs", import.meta.url));
const fixtureDirectory = path.dirname(fixture);

test("Slate inicia e encerra corretamente no Windows CMD", { skip: process.platform !== "win32" }, () => {
  const command = process.env.ComSpec ?? "cmd.exe";
  const result = spawnSync(command, ["/d", "/c", "node windows-shell-fixture.mjs"], { cwd: fixtureDirectory, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /slate-windows-shell:exit/);
});

test("Slate inicia e encerra corretamente no Windows PowerShell", { skip: process.platform !== "win32" }, () => {
  const powershell = process.env.SystemRoot ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe") : "powershell.exe";
  const command = `& '${process.execPath.replaceAll("'", "''")}' '${fixture.replaceAll("'", "''")}'`;
  const result = spawnSync(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /slate-windows-shell:exit/);
});
