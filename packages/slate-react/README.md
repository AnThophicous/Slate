# @slate-terminal/react

Camada declarativa opcional da Slate para árvores de componentes, JSX, estado, reconciliação e layout flexível.

## Uso

O pacote não importa React nem Yoga. A camada JSX pode ser usada diretamente com `jsxImportSource`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@slate-terminal/react"
  }
}
```

```tsx
import { Button, Container, createSlateRoot } from "@slate-terminal/react";

const view = <Container id="app"><Button id="send">Enviar</Button></Container>;
const root = createSlateRoot();
const operations = root.render(view);
```

## React opcional

`createReactAdapter` recebe um runtime React injetado e converte a árvore Slate em elementos React. O adapter também expõe `hooks.useSlateState` e `hooks.useSlateStore`. Nenhum pacote React é necessário para compilar ou usar o núcleo declarativo.

## Layout

`createFlexLayoutEngine` oferece um layout portátil para row, column, grow, gap, padding, margin e alinhamento. `createYogaLayoutEngine` recebe um objeto compatível com `yoga-layout` por injeção; a aplicação decide quando instalar e carregar essa dependência.

## Limitações atuais

- O layout portátil cobre um subconjunto intencional de Flexbox e não substitui Yoga em casos avançados.
- O adapter React converte a árvore para elementos React, mas não instala renderer de terminal nem intercepta eventos automaticamente.
- Hooks dependem de um runtime de hooks fornecido pela aplicação; chamar hooks fora do ciclo de renderização do runtime é inválido.
- A reconciliação produz operações declarativas e não aplica essas operações a um backend por conta própria.
- A medição de texto do layout usa pontos de código Unicode, sem uma tabela completa de largura de glifos do terminal.
