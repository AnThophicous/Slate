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
```

Use `jsxImportSource: "@slate-terminal/react"` com `jsx: "react-jsx"`. Para integrar uma fonte nativa, passe `{ poll: pollEvent }` a `createInputRouter`. O pacote core fornece os controles de raw mode e mouse capture.

Exports principais:

- runtime: `render`, `createApp`, `createSlateApp`, `SlateApplication`, `createTerminalController`;
- estado: `signal`, `computed`, `effect`, `batch`, `untracked`;
- layout: `createFlexLayoutEngine`, `createYogaLayoutEngine`;
- entrada: `createInputRouter`, `useInput`, `useFocus`, `useFocusManager`, `useCursor`, `useWindowSize`;
- componentes: `Container`, `Block`, `Text`, `Button`, `Input`, `Select`, `Checkbox`, `Tabs`, `Table`, `Spinner`, `Progress`, `Modal`, `ScrollView`, `List`, `Form`, `Glow`, `ColorShift`;
- infraestrutura: `resolveTree`, `reconcile`, `createSlateRoot`, `renderTreeToAnsi`.

Callbacks use the `ignored`, `consumed`, `render`, or `exit` contract. IDs are unique per tree and stable during reconciliation. `createSlateOutput` suppresses duplicate frames; direct writes remain available for integrations that need them.

## React integration

React is an optional peer dependency. Pass the React namespace explicitly so Slate does not impose a React version or bundle it into non-React applications:

```ts
import React from "react";
import { createSlateReactRenderer } from "@slate-terminal/react";

const slateReact = createSlateReactRenderer(React);
const element = slateReact.toReact(Container({ children: "Hello 👩‍💻" }));
```

Slate's terminal renderer remains the source of truth for terminal output; the adapter is the native bridge for React components and hooks.

For a real React application, mount React itself into Slate with the custom
terminal reconciler:

```tsx
import React from "react";
import { createReactTerminalRoot, Container, Text } from "@slate-terminal/react";

const root = await createReactTerminalRoot({ viewport: { width: 80, height: 24 } });
root.render(<Container id="app"><Text>Hello from React 👩‍💻</Text></Container>);
root.app.subscribe(commit => terminal.write(root.app.renderAnsi({ clear: false })));
```

React owns component execution, hooks, and reconciliation. Slate owns terminal
layout, focus, keyboard/mouse events, ANSI rendering, and output scheduling.

`Glow` e `ColorShift` podem envolver texto ou ser usados como `effect` em qualquer nó. O controller anima efeitos e spinners em até 60 FPS por padrão; use `animationFps: 0` para desativar a agenda automática.

Use `createI18n` for application and widget translations. It provides locale fallback to English and does not impose a translation framework.
