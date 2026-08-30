# Migração de Ink para Slate 2.0

Slate mantém a ideia de componentes declarativos e JSX, mas não exige React. A migração pode começar com os hosts equivalentes e avançar para o Slate Mosaic quando a interface precisar de layout, foco ou edição por ID.

## Mapeamento rápido

| Ink | Slate 2.0 |
|---|---|
| `render(<App />)` | `render(<App />)` de `@slate-terminal/react` |
| `Box` | `Container` |
| `Text` | `Text` ou texto filho |
| `useInput` | `useInput(app, handler)` ou `onEvent` |
| `useFocus` | `useFocus(app, id)` |
| `useFocusManager` | `useFocusManager(app)` |
| `useCursor` | `useCursor(app)` |
| `useWindowSize` | `useWindowSize(app)` |
| `useApp().exit()` | `EventResult` igual a `"exit"` |
| `useStdin` | `createInputSource` e `createInputRouter` |
| `useState` | `signal` ou `app.setState` |
| Yoga via Ink | `createYogaLayoutEngine` ou `createFlexLayoutEngine` |
| `@inkjs/ui` | widgets nativos `Input`, `Select`, `Checkbox`, `Tabs`, `Table`, `Spinner`, `Progress`, `Modal`, `ScrollView`, `List` e `Form` |

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
    "jsx": "react-jsx",
    "jsxImportSource": "@slate-terminal/react"
  }
}
```

Nenhuma instalação de React é necessária para esse caminho. `createReactAdapter` continua disponível quando uma aplicação precisa converter uma árvore Slate para um runtime React existente.

## Estado

Antes:

```tsx
const [count, setCount] = useState(0);
```

Depois:

```tsx
const count = signal(0);
const view = <Text>{count}</Text>;
count.update(value => value + 1);
```

Para estado da aplicação, `createSlateApp(view, initialState)` entrega `getState` e `setState`. Para valores locais e controlados, sinais podem ser passados diretamente em `value`, `checked`, `selectedIndex`, `activeIndex` e `progress`.

## Input e foco

```tsx
const name = signal("");
const app = render(
  <Container direction="column">
    <Input id="name" value={name} onChange={value => name.set(value)} />
    <Button id="save" onPress={() => process.stdout.write(name.peek())}>Salvar</Button>
  </Container>
);

app.focus("name");
app.dispatch({ kind: "key", code: "A" });
app.dispatch({ kind: "paste", text: " Slate" });
app.dispatch({ kind: "key", code: "Tab" });
```

Mouse e teclado chegam aos mesmos handlers. Para uma fonte nativa, conecte `pollEvent` do pacote core a `createInputRouter` e habilite raw mode, mouse capture, paste e focus change no ciclo de vida da aplicação.

## IDs e edição

O Slate Mosaic exige IDs únicos e permite localizar elementos sem percorrer referências externas. Use `app.getTree`, `app.getLayoutNode`, `app.focus`, `app.scroll` e os callbacks do nó para editar o comportamento. No core imperativo, `SlateApp.update`, `setText`, `setPlaceholder`, `setForeground`, `append` e `remove` mantêm a edição compatível com a API anterior.

## Estratégia incremental

1. Instale `@slate-terminal/core`, `@slate-terminal/react` e `@slate-terminal/native`.
2. Troque `Box` por `Container`, preservando os IDs importantes.
3. Troque `useInput` por `onEvent` ou por `useInput(app, handler)`.
4. Troque `useState` por sinais controlados nos widgets.
5. Agrupe regiões da tela em containers Mosaic.
6. Ative o binding nativo e o router de eventos quando a interface estiver pronta.

O código legado pode continuar usando `renderText`, `createApp` e os nós imperativos enquanto a migração acontece.
