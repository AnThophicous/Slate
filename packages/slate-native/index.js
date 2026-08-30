const path = require("node:path");
const fs = require("node:fs");

const names = [
  `slate_node.${process.platform}-${process.arch}.node`,
  "slate_node.node",
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
