# @slate-terminal/core

Facade TypeScript estável da Slate 2.0.0. O pacote fornece renderização ANSI com fallback, binding nativo opcional, eventos unificados, nós imperativos, widgets, sinais básicos e controles de terminal.

```ts
import { Button, Container, createApp, renderText } from "@slate-terminal/core";

const root = Container({
  id: "app",
  children: Button({ id: "save", label: "Salvar" })
});
const app = createApp(root);
app.focus("save");
process.stdout.write(app.render());
process.stdout.write(renderText("Olá, Slate", { foreground: "#5eead4" }));
```

O core exporta `Container`, `Block`, `Text`, `Button`, `Input`, `Select`, `Checkbox`, `Tabs`, `Table`, `Spinner`, `Progress`, `Modal`, `ScrollView`, `List` e `Form`. `SlateApp.update`, `edit`, `setText`, `setPlaceholder`, `setForeground`, `append`, `remove`, `focusNext`, `blur`, `setState` e `dispatch` permitem manter uma aplicação imperativa compatível.

`signal`, `ReadableSignal`, `WritableSignal`, `createInputSource`, `pollEvent`, raw mode, mouse capture, bracketed paste e focus change completam a integração com Node.js. Para JSX, use `@slate-terminal/react`, que compartilha os contratos de eventos e IDs.
