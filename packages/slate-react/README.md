# @slate-terminal/react

Runtime declarativo TSX da Slate 2.0.0. O pacote não importa React e oferece uma árvore de componentes, reatividade, layout Flexbox, foco, widgets, reconciliação e renderização ANSI.

```tsx
import { Button, Container, Input, Text, createTerminalController, render, signal } from "@slate-terminal/react";
import { createInputSource } from "@slate-terminal/core";

const value = signal("");
const app = render(
  <Container id="app" direction="column" gap={1}>
    <Text>Slate Mosaic</Text>
    <Input id="value" value={value} onChange={next => value.set(next)} />
    <Button id="save" onPress={() => { process.stdout.write(value.peek()); }}>Salvar</Button>
  </Container>,
  { viewport: { width: 80, height: 24 } }
);

const terminal = createTerminalController(app, createInputSource(), { write: value => process.stdout.write(value) });
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

Todos os callbacks usam o contrato `ignored`, `consumed`, `render` ou `exit`. IDs são únicos por árvore e são usados como identidade estável durante a reconciliação. O controller de terminal conecta entrada, commits e saída ANSI sem impor um runtime de UI.

`Glow` e `ColorShift` podem envolver texto ou ser usados como `effect` em qualquer nó. O controller anima efeitos e spinners em até 60 FPS por padrão; use `animationFps: 0` para desativar a agenda automática.
