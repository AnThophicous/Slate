# @slate-terminal/react

Production-grade declarative terminal UI for TypeScript and TSX. React is optional: the Slate runtime and window/element API remain available without React, while `createSlateReactRenderer` exposes the same tree and hooks through a real React runtime.

```tsx
import { Button, Container, Input, Text, createSlateOutput, createTerminalController, render, signal } from "@slate-terminal/react";
import { createInputSource } from "@slate-terminal/core";

const value = signal("");
const app = render(
  <Container id="app" direction="column" gap={1}>
    <Text>Slate Mosaic</Text>
    <Input id="value" value={value} onChange={next => value.set(next)} />
    <Button id="save" onPress={() => value.set("saved")}>Save</Button>
  </Container>,
  { viewport: { width: 80, height: 24 } }
);

const terminal = createTerminalController(app, createInputSource(), createSlateOutput(process.stdout));
terminal.start();
// Ctrl+C calls the same close path; use this for normal shutdown too.
// terminal.close();
```

Use `jsxImportSource: "@slate-terminal/react"` com `jsx: "react-jsx"`. Para integrar uma fonte nativa, passe `{ poll: pollEvent }` a `createInputRouter`. O pacote core fornece os controles de raw mode e mouse capture.

Leia o [guia de produção](../../docs/guide.md) para o fluxo completo de
montagem, `Ctrl+C`, hit-test de mouse, `disabled`, `onEvent`, `onHover`,
wrapping por grapheme, `LogView` rico, testes Windows e migração de renderers.

Exports principais:

- runtime: `render`, `createApp`, `createSlateApp`, `SlateApplication`, `createTerminalController`;
- estado: `signal`, `computed`, `effect`, `batch`, `untracked`;
- layout: `createFlexLayoutEngine`, `createYogaLayoutEngine`;
- entrada: `createInputRouter`, `createNormalizedInput`, `normalizeEvent`, `sameEvent`, `useInput`, `useFocus`, `useFocusManager`, `useCursor`, `useWindowSize`;
- componentes: `Container`, `Block`, `Text`, `Button`, `Input`, `Select`, `Checkbox`, `Tabs`, `Table`, `Spinner`, `Progress`, `Modal`, `ScrollView`, `List`, `Form`, `Glow`, `ColorShift`;
- apresentação: `LogView`, `TextStyle`, `LogLine`, `LogRun`, `wrapText`;
- infraestrutura: `resolveTree`, `reconcile`, `createSlateRoot`, `renderTreeToAnsi`.

Callbacks use the `ignored`, `consumed`, `render`, or `exit` contract. IDs are unique per tree and stable during reconciliation. `createSlateOutput` suppresses duplicate frames; direct writes remain available for integrations that need them.

`createTerminalController` expõe `stop`, `close` e `dispose`. `Ctrl+C` é
reservado como saída de emergência e fecha o controller antes de chamar
`onExit`; `closeTerminal()` do core restaura os modos nativos.

## React integration

React is an optional peer dependency. Pass the React namespace explicitly so Slate does not impose a React version or bundle it into non-React applications:

```ts
import React from "react";
import { Container, createSlateReactRenderer } from "@slate-terminal/react";

const slateReact = createSlateReactRenderer(React);
const element = slateReact.toReact(Container({ children: "Hello 👩‍💻" }));
```

Slate's terminal renderer remains the source of truth for terminal output; the adapter is the native bridge for React components and hooks.

For a real React application, mount React itself into Slate with the custom
terminal reconciler. The Slate JSX components are not React components in this
mode; create host elements with `React.createElement`:

```tsx
import React from "react";
import { createInputSource } from "@slate-terminal/core";
import { createReactTerminalRoot, createSlateOutput, createTerminalController } from "@slate-terminal/react";

const root = await createReactTerminalRoot({ viewport: { width: 80, height: 24 } });
const terminal = createTerminalController(root.app, createInputSource(), createSlateOutput(process.stdout));
root.render(React.createElement(
  "container",
  { id: "app", direction: "column", padding: 1 },
  React.createElement("text", { id: "title", text: "Hello from React 👩‍💻" })
));
terminal.start();

// terminal.close() also unmounts the Slate tree and removes its SIGINT hook.
```

React owns component execution, hooks, and reconciliation. Slate owns terminal
layout, focus, keyboard/mouse events, ANSI rendering, and output scheduling.

The reconciler peer is optional for React-free consumers. Pin a compatible pair
when using real React elements:

| React | `react-reconciler` |
| --- | --- |
| 18.x | 0.29.x |
| 19.x | 0.31.x |

If the pair is missing or incompatible, `createReactTerminalRoot` reports the
expected line. `createReactAdapter(React)` remains the simpler bridge when
React should only consume Slate nodes, including React 18 applications that do
not need a terminal reconciler.

`Glow` e `ColorShift` podem envolver texto ou ser usados como `effect` em qualquer nó. O controller anima efeitos e spinners em até 60 FPS por padrão; use `animationFps: 0` para desativar a agenda automática.

Use `createI18n` for application and widget translations. It provides locale fallback to English and does not impose a translation framework.
