import { createSlateApp, Text } from "../packages/slate-react/dist/index.js";

const app = createSlateApp(Text({ id: "fixture", text: "windows" }), { viewport: { width: 12, height: 1 } });
const result = app.dispatch({ kind: "key", code: "c", modifiers: 2 });
if (result !== "exit") process.exitCode = 1;
process.stdout.write(`slate-windows-shell:${result}\n`);
