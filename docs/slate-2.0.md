# Slate 2.0.0

Slate 2.0 consolidates a terminal UI runtime nativo, sem React, para Node.js, TypeScript, TSX e Rust. A compatibilidade entre teclado e mouse é intencional: componentes recebem eventos Slate e não precisam conhecer a origem física da entrada.

## Slate Mosaic

Slate Mosaic é o modelo de composição da Slate. Cada interface é uma árvore de elementos com um container pai, filhos, IDs estáveis, propriedades de layout e handlers. A árvore é resolvida, comparada e apresentada em um ciclo controlado.

```tsx
import { Button, Container, Text } from "@slate-terminal/react";

const view = (
  <Container id="screen" direction="column" gap={1} padding={1}>
    <Text id="heading">Slate Mosaic</Text>
    <Container id="actions" direction="row" gap={2}>
      <Button id="accept">Aceitar</Button>
      <Button id="cancel">Cancelar</Button>
    </Container>
  </Container>
);
```

IDs são únicos na árvore. A resolução falha cedo quando encontra uma duplicata, evitando atualizações ambíguas. `app.getTree()`, `app.getLayoutNode(id)`, `app.focus(id)`, `app.scroll(id, x, y)` e as operações de reconciliação tornam edição e inspeção determinísticas.

## Render e ciclo de vida

```ts
import { Container, render } from "@slate-terminal/react";

const app = render(() => Container({ id: "root", children: "Slate" }), {
  viewport: { width: 80, height: 24 }
});

const unsubscribe = app.subscribe(commit => {
  process.stdout.write(app.renderAnsi({ clear: false }));
  process.stdout.write(String(commit.operations.length));
});

app.dispatch({ kind: "resize", width: 100, height: 30 });
app.unmount();
unsubscribe();
```

`render` monta automaticamente e retorna um app controlável. `flush` força o ciclo pendente; sinais alterados no mesmo tick são agrupados em uma apresentação. `frameRate` opcional limita a frequência de commits assíncronos. O renderer Rust também elimina frames idênticos e pode aplicar throttle, reduzindo stuttering e spam de terminal.

## Estado e reatividade

```ts
import { computed, effect, signal } from "@slate-terminal/react";

const count = signal(0);
const label = computed(() => `Contagem: ${count.get()}`);
const stop = effect(() => {
  label.get();
});

count.update(value => value + 1);
stop();
```

Sinais aceitam `get`, `peek`, `set`, `update` e `subscribe`. `get` participa da coleta de dependências; `peek` lê sem criar dependência. `batch` agrupa alterações. Propriedades visuais podem receber sinais diretamente:

```tsx
const progress = signal(0);
const view = <Progress id="progress" progress={progress} />;
progress.set(0.75);
```

Uma propriedade reativa atualiza a apresentação sem obrigar a aplicação a recriar manualmente cada elemento. Quando o sinal participa da própria função de view, a árvore é reconciliada e apenas operações efetivamente diferentes são emitidas.

## Layout

```tsx
<Container
  direction="row"
  wrap="wrap"
  width="100%"
  minHeight={4}
  gap={1}
  justifyContent="space-between"
  alignItems="center"
>
  <Block flexGrow={1} minWidth={20} maxWidth="60%">Conteúdo</Block>
  <ScrollView width="30%" height={8} overflow="scroll" />
</Container>
```

O engine portátil fornece:

- direção `row`/`column` e `wrap`;
- `flexGrow`, `flexShrink` e `flexBasis`;
- `justifyContent`, `alignItems`, `alignContent` e `alignSelf`;
- `gap`, `rowGap`, `columnGap`, padding e margin;
- números, porcentagens e `auto` em width/height/min/max;
- `visible`, `display`, `overflow`, `scrollLeft` e `scrollTop`;
- hit-test espacial respeitando clipping e scroll.

Quando a aplicação já usa Yoga, `createYogaLayoutEngine(runtime)` injeta o runtime sem tornar Yoga uma dependência obrigatória.

## Widgets

`Input` aceita valor controlado, placeholder, cursor, paste e IME. `Select`, `Checkbox` e `Tabs` trabalham com sinais ou callbacks. `Table`, `List`, `Form`, `Modal`, `ScrollView`, `Spinner` e `Progress` são hosts prontos para composições maiores.

```tsx
const mode = signal(0);
const accepted = signal(false);

const form = (
  <Form id="form" direction="column" gap={1}>
    <Select id="mode" options={[{ label: "Local" }, { label: "Produção" }]} selectedIndex={mode} />
    <Checkbox id="accepted" label="Aceito os termos" checked={accepted} />
    <Button id="submit" onPress={() => process.stdout.write("enviado")}>Enviar</Button>
  </Form>
);
```

## Entrada e foco

```ts
import { createInputRouter, createTerminalController, useInput, useFocus, useWindowSize } from "@slate-terminal/react";
import { createInputSource } from "@slate-terminal/core";

const stopInput = useInput(app, event => {
  if (event.kind === "key" && event.code === "Escape") return "exit";
  return "ignored";
});
const router = createInputRouter(app, createInputSource());
router.start();
const field = useFocus(app, "name");
field.focus();
const size = useWindowSize(app);
```

Para ligar entrada, commits e stdout em uma única sessão, use `createTerminalController(app, source, { write })`. Ele escreve o frame inicial, continua escrevendo commits e restaura o cursor ao parar.

`Tab` e `Shift+Tab` percorrem elementos com `focusable`. Mouse usa coordenadas do layout, com prioridade para o filho superior e bubbling até os pais. Handlers podem retornar `ignored`, `consumed`, `render` ou `exit`.

## Cores e UTF-8

Foreground e background aceitam `#RGB` e `#RRGGBB`. O renderer usa sequências RGB ANSI e mantém caracteres Unicode; largura de glifos largos é considerada durante a composição.

## Efeitos acopláveis

`Glow` e `ColorShift` são componentes opcionais que podem envolver texto ou receber uma especificação `effect` em qualquer nó. A interpolação acontece por glifo, com uma onda curta e suave; o controller agenda a apresentação até 60 FPS por padrão e elimina frames idênticos.

```tsx
import { ColorShift, Container, Glow, Text } from "@slate-terminal/react";

const view = (
  <Container direction="column">
    <Glow color="#ffffff" intensity={0.45}>Slate</Glow>
    <ColorShift from="#22d3ee" to="#a78bfa">Mosaic</ColorShift>
    <Text effect={{ kind: "glow", color: "#f8fafc" }}>IDs estáveis</Text>
  </Container>
);
```

## Compatibilidade LTS

Dentro de 2.x, o contrato é aditivo. IDs, tipos de evento, métodos do app, componentes existentes e assinaturas públicas não são removidos. Um recurso novo recebe uma API nova e pode coexistir com a anterior. Mudanças de major ficam separadas por guia de migração.
