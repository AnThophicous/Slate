# Migração de Ink para Slate 2.3.0

Slate mantém a composição declarativa e o JSX, mas separa a árvore da aplicação
do ciclo de vida do terminal. Essa diferença é o ponto que mais importa ao
migrar: criar uma view não inicia uma sessão física.

## Mapeamento rápido

| Ink | Slate 2.3.0 |
|---|---|
| `render(<App />)` inicia a aplicação | `render(<App />)` cria um `SlateApplication`; use um controller para iniciar input/output |
| `Box` | `Container` |
| `Text` | `Text` ou texto filho |
| `useInput` | `useInput(app, handler)` ou `onEvent` |
| `useFocus` | `useFocus(app, id)` |
| `useFocusManager` | `useFocusManager(app)` |
| `useCursor` | `useCursor(app)` |
| `useWindowSize` | `useWindowSize(app)` |
| `useApp().exit()` | handler que retorna `"exit"` |
| `useStdin` | `createTerminalSession().input` ou fonte própria + `createInputRouter` |
| `useState` | `signal` ou `app.setState` |
| Yoga via Ink | `createYogaLayoutEngine` ou `createFlexLayoutEngine` |
| `@inkjs/ui` | `Input`, `Select`, `Checkbox`, `Tabs`, `Table`, `Spinner`, `Progress`, `Modal`, `ScrollView`, `List` e `Form` |

## Instalação e ciclo de vida

Para renderização ANSI e JSX sem React:

```powershell
npm install @slate-terminal/core @slate-terminal/react
```

Para teclado e mouse do terminal, acrescente:

```powershell
npm install @slate-terminal/native
```

A instalação de native é desnecessária para um frame. Rust só é necessário para
compilar esse addon a partir do checkout com `npm run native:build`.

O equivalente ao `render(<App />)` de Ink, quando a aplicação precisa de input
físico, é explícito:

```js
import { createTerminalSession } from "@slate-terminal/core";
import { Container, Text, createSlateOutput, createTerminalController, render } from "@slate-terminal/react";

const app = render(Container({
  id: "app",
  children: Text({ id: "message", text: "Press Ctrl+C to exit" })
}), { viewport: { width: 40, height: 2 } });

const session = createTerminalSession();
const terminal = createTerminalController(
  app,
  session.input,
  createSlateOutput(process.stdout),
  { onExit: () => session.close() }
);

const shutdown = () => {
  terminal.close();
  session.close();
};

process.once("SIGTERM", shutdown);
terminal.start();
```

`terminal.start()` inicia o polling. `terminal.close()` fecha o router e a
árvore; `session.close()` libera a fonte e restaura os modos nativos. `Ctrl+C`
já é tratado pelo controller. Se o addon estiver ausente, o caminho acima falha
em `createTerminalSession()` com uma mensagem explícita; `renderAnsi()` continua
disponível.

## JSX sem React

Antes:

```tsx
import React from "react";
import { Box, Text } from "ink";

export function App() {
  return <Box flexDirection="column"><Text>Slate</Text></Box>;
}
```

Depois:

```tsx
import { Container, Text } from "@slate-terminal/react";

export function App() {
  return <Container direction="column"><Text>Slate</Text></Container>;
}
```

No `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "jsx": "react-jsx",
    "jsxImportSource": "@slate-terminal/react",
    "strict": true
  }
}
```

Esse caminho não instala React. `createReactAdapter` e
`createReactTerminalRoot` ficam disponíveis quando a aplicação realmente usa
React e o reconciler compatível.

## Estado, input e foco

Sinais substituem o estado local de um componente:

```tsx
import { Text, signal } from "@slate-terminal/react";

const count = signal(0);
const view = Text({ id: "count", text: count });
count.update(value => value + 1);
```

Para testar input sem um terminal, use eventos diretamente na aplicação:

```js
import { Button, Container, Input, render, signal } from "@slate-terminal/react";

const name = signal("");
const app = render(Container({
  id: "app",
  children: [
    Input({ id: "name", value: name, onChange: value => name.set(value) }),
    Button({ id: "save", label: "Salvar" })
  ]
}), { viewport: { width: 20, height: 2 } });

app.focus("name");
app.dispatch({ kind: "key", code: "A" });
app.dispatch({ kind: "paste", text: " Slate" });
app.dispatch({ kind: "key", code: "Tab" });
app.close();
```

Mouse e teclado chegam aos mesmos handlers. Para uma fonte nativa, prefira
`createTerminalSession().input`; para uma fonte de teste ou de outro processo,
implemente `poll(timeoutMs)` e conecte-a com `createInputRouter`.

## Estratégia incremental

1. Instale `@slate-terminal/core` e `@slate-terminal/react`.
2. Troque `Box` por `Container`, preservando IDs que participam de foco e edição.
3. Troque `useInput` por `onEvent` ou por `useInput(app, handler)`.
4. Troque `useState` por sinais controlados nos widgets.
5. Adicione `@slate-terminal/native` somente quando a aplicação precisar de
   input físico.
6. Feche sempre o controller e a sessão no caminho normal de saída.

O [guia de produção](guide.md) cobre o ciclo completo. A [referência para agentes](ai-agents.md) resume contratos e erros para ferramentas
que precisam gerar código sem adivinhar o lifecycle.
