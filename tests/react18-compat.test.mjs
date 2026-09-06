// React 18 compatibility, without any install at test time.
//
// `tests/react18` is a private workspace whose devDependencies pin react 18.3.1
// and react-reconciler 0.29.2. npm nests them under that directory because the
// root already resolves react 19 / react-reconciler 0.31, so `npm ci` at the
// repository root reproduces both trees from the committed lockfile.
//
// The built `dist` is copied into that directory so Node resolves
// `react-reconciler` from `tests/react18/node_modules` instead of the root.
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { cpSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const fixture = fileURLToPath(new URL("./react18/", import.meta.url));
const destination = join(fixture, "slate");
const require = createRequire(join(fixture, "noop.cjs"));

test("react 18 + react-reconciler 0.29 montam, atualizam e fecham", async () => {
  assert.ok(
    existsSync(join(fixture, "node_modules", "react")),
    "fixture sem dependências: rode `npm install` (ou `npm ci`) na raiz do repositório"
  );
  assert.equal(require("react/package.json").version, "18.3.1");
  assert.equal(require("react-reconciler/package.json").version, "0.29.2");

  const dist = fileURLToPath(new URL("../packages/slate-react/dist/", import.meta.url));
  assert.ok(existsSync(join(dist, "index.js")), "dist ausente: rode `npm run build` antes");
  rmSync(destination, { recursive: true, force: true });
  cpSync(dist, destination, { recursive: true });

  try {
    const React = await import(pathToFileURL(join(fixture, "node_modules/react/index.js")).href);
    const slate = await import(pathToFileURL(join(destination, "index.js")).href);
    const createElement = React.createElement ?? React.default.createElement;

    const root = await slate.createReactTerminalRoot({ viewport: { width: 20, height: 3 } });
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));
    const view = props => createElement("container", { id: "root" }, createElement("text", { id: "msg", ...props }));

    root.render(view({ text: "old", foreground: "#ff0000" }));
    await flush();
    assert.equal(root.app.getTree()?.children[0]?.props.text, "old");
    assert.equal(root.app.getTree()?.children[0]?.props.foreground, "#ff0000");

    root.render(view({ text: "new" }));
    await flush();
    assert.equal(root.app.getTree()?.children[0]?.props.text, "new");
    assert.equal(root.app.getTree()?.children[0]?.props.foreground, undefined);

    root.close();
    assert.equal(root.app.getTree(), null);
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
});
