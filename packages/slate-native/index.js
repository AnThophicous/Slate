const path = require("node:path");
const fs = require("node:fs");

const platformTarget = process.platform === "win32" ? `win32-${process.arch}-msvc` : process.platform === "linux" ? `linux-${process.arch}-gnu` : process.platform === "darwin" ? `darwin-${process.arch}` : undefined;
if (!platformTarget) throw new Error(`Slate native does not support ${process.platform}-${process.arch}`);
const names = [
  `slate_node.${platformTarget}.node`,
  "slate_node.node",
  `index.${platformTarget}.node`,
  "index.node",
];
const candidates = names.map((name) => path.join(__dirname, name));
candidates.push(path.join(__dirname, "..", "..", "target", "release", "slate_node.dll"));
candidates.push(path.join(__dirname, "..", "..", "target", "release", "libslate_node.so"));
candidates.push(path.join(__dirname, "..", "..", "target", "release", "libslate_node.dylib"));
for (const candidate of candidates) {
  if (fs.existsSync(candidate)) {
    if (candidate.endsWith(".node")) module.exports = require(candidate);
    else process.dlopen(module, candidate);
    break;
  }
}
if (!module.exports || Object.keys(module.exports).length === 0) throw new Error("Addon Slate não compilado. Execute npm run native:build e empacote o arquivo .node.");
