# Slate API para agentes de IA

Leia esta página antes de gerar código Slate. A API tem dois lifecycles distintos:
`renderAnsi()` produz um frame; `createTerminalController()` mantém uma sessão
viva. Não trate um pelo outro.

## Escolha a entrada

| Necessidade | API | Pacotes | Native necessário? |
| --- | --- | --- | --- |
| Gerar uma saída ANSI e terminar | `render()` + `app.renderAnsi()` | `@slate-terminal/react` | Não |
| Testar dispatch com eventos próprios | `render()` + `createTerminalController()` | `@slate-terminal/core`, `@slate-terminal/react` | Não |
| Ler teclado/mouse do terminal | `createTerminalSession()` + `createTerminalController()` | os dois anteriores + `@slate-terminal/native` | Sim |
| Renderizar elementos React reais | `createReactTerminalRoot()` | React + `react-reconciler` compatíveis | Não para o runtime; sim para o reconciler |

Requisito comum: Node.js 18+. React é peer opcional. Rust só é necessário para
compilar `@slate-terminal/native` a partir do checkout.

## Instalação

```powershell
npm install @slate-terminal/core @slate-terminal/react
```

Para uma sessão com input físico:

```powershell
npm install @slate-terminal/native
```

No checkout do Slate, `npm run native:build` produz o addon local. Sem o addon,
o fallback ANSI continua disponível, mas `createTerminalSession()` não pode
habilitar raw mode, alternate screen, mouse, paste e foco.

## Frame único

Este é o menor programa funcional. `render()` monta a árvore; `renderAnsi()`
devolve uma string; `app.close()` libera a aplicação Slate.

```js
import { Container, Text, render } from "@slate-terminal/react";

const app = render(
  Container({
    id: "app",
    children: Text({ id: "message", text: "Hello from Slate" })
  }),
  { viewport: { width: 40, height: 2 } }
);

process.stdout.write(app.renderAnsi({ clear: false, hideCursor: true }));
app.close();
```

Esse código não inicia polling, não habilita raw mode e não espera teclado.

## Sessão viva

O caminho físico tem uma fonte e um controller explícitos. `start()` começa o
polling. `close()` fecha o router e a árvore; `session.close()` fecha a fonte
nativa. Os dois fechamentos são idempotentes.

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

O controller já trata `Ctrl+C` como saída de emergência. Um handler de botão
também pode retornar `"exit"`.

## Sessão determinística sem native

Para testes ou uma fonte externa, forneça o contrato `poll()` diretamente. O
controller continua sendo o dono do lifecycle, mas nenhum modo físico é aberto:

```js
import { Container, Text, createTerminalController, render } from "@slate-terminal/react";

const writes = [];
const source = {
  poll: () => null,
  size: () => ({ width: 40, height: 2 }),
  close: () => undefined
};
const app = render(Container({
  id: "app",
  children: Text({ id: "message", text: "Controlled input" })
}), { viewport: { width: 40, height: 2 } });
const terminal = createTerminalController(app, source, { write: frame => writes.push(frame) });

terminal.start();
await new Promise(resolve => setTimeout(resolve, 20));
terminal.close();
console.log({ frames: writes.length, running: terminal.running() });
```

O resultado esperado é `running: false` e pelo menos um frame. Essa forma é útil
para testar render e dispatch sem depender de um TTY.

## Contratos que não devem ser inferidos

- `render()` e `renderAnsi()` não iniciam uma sessão viva.
- `createTerminalController()` não cria uma fonte nativa por conta própria.
- `createTerminalSession()` exige o addon native; não há fallback para input físico.
- `@slate-terminal/react` não significa que React é obrigatório.
- `createSlateOutput()` deduplica frames iguais; escreva nele, não em stdout a
  cada callback de estado.
- `controller.close()` fecha o app anexado. Depois dele, não despache eventos.
- `app.close()` é o fechamento do runtime JSX; o `SlateApp` imperativo do core
  expõe `render()`, mas não representa uma sessão física.

## Expressive, Dock e Mosaic

Para uma aparencia M3-inspired sem React, use `createMaterialExpressivePreset()`.
Ele entrega tokens semanticos, formas de borda, estados de hover/foco/press e
efeitos ja suportados pelo renderer. O terminal nao tem CSS, elevacao ou uma
timeline de browser: agentes nao devem prometer esses comportamentos.

```js
import { createMaterialExpressivePreset } from "@slate-terminal/react";

const ui = createMaterialExpressivePreset({
  colors: { primary: "#8bd5ff" },
  shapes: { rounded: { style: "rounded", color: "#496a85" } }
});
const button = ui.button({
  id: "run",
  role: "secondary",
  shape: "rounded",
  states: { hover: { shape: "heavy" } },
  children: "Executar"
});
```

`ExpressiveSurface`/`ExpressiveButton` sao atalhos para o preset padrao.
`Dock`/`DockItem` montam uma barra horizontal com `active`, `disabled`,
`onHover` e `onPress`; `Mosaic`/`MosaicItem` montam uma grade com colunas,
imagens, descricao, selecao, borda e effect. Eles aceitam quatro itens ou mais,
mas nao impoem uma contagem fixa. Para controlar estado, use `signal()` e
callbacks; nao crie timers por item.
Se a view for reconstruida a cada commit, crie `createExpressiveInteraction()`
fora da view e passe `interaction` para DockItem/MosaicItem; isso preserva
hover/foco sem estado global escondido.

## Raster para ASCII

Use `decodeRaster(buffer)` para dados ja carregados ou
`loadRasterFile(path, { rootDir })` para arquivos locais. A segunda forma exige
uma raiz explicita, limita o tamanho e rejeita URL, traversal e symlink fora da
raiz. `imageToAscii(raster, options)` aceita RGB/RGBA/grayscale, largura maxima,
proporcao, charset, inversao, alpha e ANSI24 opt-in. JPEG, GIF, WebP e TIFF
precisam ser convertidos por um decoder externo antes de entrar no core.

## Erros e preflight

`hasNativeBinding()` é a função de preflight do core. Se retornar `false`, use a
rota ANSI/fonte própria ou instale o pacote native correspondente.
`getNativeBindingError()` devolve o erro de carregamento em cache quando existe,
sem substituir o fallback ANSI. A criação de uma sessão sem addon lança:

```text
Binding nativo da Slate não encontrado; compile slate-node primeiro.
```

Um pacote native instalado sem o `.node` correto pode falhar com
`ERR_SLATE_NATIVE_BINARY_NOT_FOUND`; um addon carregado com exports incompatíveis
falha com `ERR_SLATE_NATIVE_CONTRACT`. Esses erros devem ser reportados, não
substituídos por `typeof` defensivo ou por uma sessão falsa.

## Referências

- [README principal](../README.md): instalação e entrada rápida.
- [Guia de produção](guide.md): layout, eventos, foco e encerramento.
- [Exemplo interativo](../examples/node/interactive.mjs): widgets, sinais e
  cleanup com native.
- [README do runtime](../packages/slate-react/README.md): exports e integração
  React.
