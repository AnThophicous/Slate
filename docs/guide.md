# Guia de produção da Slate 2.3

Este é o guia completo para construir uma interface de terminal com Slate. Ele
explica a arquitetura, a escolha dos pacotes, o ciclo de vida do terminal,
layout, eventos, foco, mouse, estado reativo, texto Unicode, LogView,
integração com React e migração de renderers antigos.

Os exemplos usam TypeScript/TSX e podem ser adaptados para JavaScript usando as
mesmas funções. A Slate exige Node.js 18 ou superior. O binding nativo oficial
fornece entrada e operações de terminal para Linux, Windows e macOS; sem ele,
o renderer ANSI de fallback continua útil para testes e saídas simples.

## 1. Escolha o caminho certo

Há três formas oficiais de usar a Slate:

| Caso | Pacote e API | React necessário? |
| --- | --- | --- |
| Interface declarativa TSX, sem React | @slate-terminal/react + render | Não |
| Árvore imperativa e compatibilidade de baixo nível | @slate-terminal/core + createApp | Não |
| Componentes React reais, hooks React e reconciler terminal | @slate-terminal/react + createReactTerminalRoot | Sim |

O nome @slate-terminal/react significa que o pacote oferece uma ponte opcional
para React; o runtime principal não importa React durante o carregamento. Para
uma aplicação nova, comece pelo caminho sem React. Ele reduz dependências, é
mais fácil de testar e usa o mesmo contrato de eventos que o caminho React.

## 2. Instalação

~~~powershell
npm install @slate-terminal/core @slate-terminal/react @slate-terminal/native
~~~

Durante o desenvolvimento local deste monorepo:

~~~powershell
npm install
npm run build
npm run build:all # opcional; inclui o binding nativo e exige Rust
~~~

O pacote @slate-terminal/native escolhe o binário da plataforma atual. Se o
binário não estiver instalado, chamadas como enableRawMode() falham com uma
mensagem explícita; o renderer TypeScript ainda consegue produzir ANSI.

## 3. O modelo Slate Mosaic

Uma aplicação Slate é uma árvore de nós. Cada nó possui:

1. um type (container, text, button, input e outros hosts);
2. um id estável, usado por foco, edição e reconciliação;
3. propriedades de layout, visual e comportamento;
4. filhos que formam a composição visual;
5. handlers que recebem o evento normalizado.

O fluxo normal é:

~~~text
fonte nativa/customizada
        ↓ normalizeEvent
createInputRouter
        ↓ app.dispatch
hit-test ou caminho focado
        ↓ onEvent → handler específico → widget default
resultado (ignored/consumed/render/exit)
        ↓
layout → frame ANSI → output deduplicado
~~~

IDs precisam ser únicos na árvore inteira. O mesmo ID em dois irmãos torna
edição e foco ambíguos e é rejeitado pela resolução da árvore.

## 4. Primeiro aplicativo completo

O exemplo abaixo habilita os modos necessários, conecta input e output e
garante que o terminal seja restaurado mesmo quando a aplicação termina.

~~~tsx
import {
  Button,
  Container,
  Input,
  Text,
  render,
  signal,
  createTerminalController
} from "@slate-terminal/react";
import {
  createInputSource,
  enableAlternateScreen,
  enableBracketedPaste,
  enableFocusChange,
  enableMouseCapture,
  enableRawMode
} from "@slate-terminal/core";

const name = signal("");
const app = render(() => (
  <Container id="app" direction="column" gap={1} padding={1}>
    <Text id="title">Cadastro</Text>
    <Input
      id="name"
      value={name}
      placeholder="Seu nome"
      onChange={value => name.set(value)}
    />
    <Button id="save" onPress={() => name.set("salvo")}>Salvar</Button>
  </Container>
), { viewport: { width: 80, height: 24 } });

const terminal = createTerminalController(
  app,
  createInputSource(),
  { write: value => process.stdout.write(value) }
);

enableAlternateScreen();
enableRawMode();
enableMouseCapture();
enableBracketedPaste();
enableFocusChange();
terminal.start();

// terminal.close() é idempotente, desmonta a árvore Slate e libera a fonte
// nativa, que restaura os modos abertos acima.
function shutdown(): void {
  terminal.close();
}

process.once("SIGINT", shutdown);
~~~

Na prática, o controller já instala um listener de SIGINT e também entende
Ctrl+C como saída de emergência. O process.once no exemplo é opcional; se ele
existir, mantenha o callback idempotente como no exemplo.

Para um programa que não usa input contínuo, basta fazer:

~~~ts
const app = render(Text({ id: "hello", text: "Olá" }), {
  viewport: { width: 20, height: 2 }
});
process.stdout.write(app.renderAnsi());
app.close();
~~~

## 5. Ciclo de vida e encerramento

Existem três níveis de encerramento:

- app.unmount() desmonta a árvore, mas mantém as subscriptions públicas para
  uma eventual remontagem;
- app.close() desmonta a árvore e remove subscriptions de listeners do app;
- router.close() para polling, libera a fonte e fecha o app anexado;
- controller.stop() pausa polling e restaura cursor/output, mantendo o app
  montado;
- controller.close() faz stop() e fecha o app; dispose() é seu alias;
- closeTerminal() restaura cursor, raw mode, mouse capture, bracketed paste,
  focus change e alternate screen no binding nativo.

Ctrl+C é reservado como comando de emergência. Um evento de tecla com CONTROL e
código c/C retorna "exit" antes dos handlers de aplicação. Isso evita que um
onEvent acidentalmente engula o comando e deixe a interface presa em raw mode.
Um botão ou outro handler pode encerrar normalmente retornando "exit".

~~~ts
app.subscribeInput(event => {
  if (event.kind === "key" && event.code === "Escape") return "exit";
  return "ignored";
});

// Também é válido fechar explicitamente:
terminal.close();
~~~

Use try/finally quando os modos nativos forem habilitados em uma função que
possa lançar erro:

~~~ts
try {
  enableAlternateScreen();
  enableRawMode();
  enableMouseCapture();
  terminal.start();
} finally {
  // Em um programa interativo real, chame isto no caminho de encerramento,
  // depois que o loop deixar de ser necessário.
  // terminal.close();
  // closeTerminal();
}
~~~

Não escreva sequências ANSI de limpeza/cursor ou process.stdout.write
diretamente em handlers de negócio. O controller já controla o primeiro frame,
cursor, deduplicação e ordem de apresentação.

### Sessão interativa segura

Quando o programa controla o terminal inteiro, use a sessão de alto nível para
que uma falha durante a ativação reverta os modos já abertos:

~~~ts
import { createTerminalSession } from "@slate-terminal/core";
import { createTerminalController, createSlateOutput } from "@slate-terminal/react";

const session = createTerminalSession();
const terminal = createTerminalController(app, session.input,
  createSlateOutput(process.stdout), {
    onError: error => process.stderr.write(`Slate: ${String(error)}\\n`)
  });
terminal.start();

// Os dois caminhos são idempotentes.
process.once("SIGINT", () => { terminal.close(); session.close(); });
~~~

`createTerminalController` captura exceções da fonte de input e da saída,
encerra polling, remove listeners e desmonta o app. `onError` é opcional; o
erro também fica disponível em `controller.error()`. Uma view que invalida o
próprio estado em ciclo é interrompida por `maxRenderPasses` (100 por padrão),
em vez de travar o processo.

## 6. JSX sem React

Configure o TypeScript para usar o runtime JSX da Slate:

~~~json
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
~~~

Os componentes podem ser usados como JSX ou como funções:

~~~tsx
const view = (
  <Container id="screen" direction="column">
    <Text id="header">Slate</Text>
    <Button id="ok" onPress={() => "exit"}>OK</Button>
  </Container>
);

const sameView = Container({
  id: "screen",
  direction: "column",
  children: [Text({ id: "header", text: "Slate" })]
});
~~~

O texto filho de Text, Block e Button vira um nó de texto interno. Use text
quando precisar atualizar o valor por app.update ou quando quiser ser
explícito sobre a origem do conteúdo.

## 7. Estado reativo

signal é a escolha padrão para valores locais ou controlados:

~~~tsx
const progress = signal(0);
const message = computed(() => "Progresso: " + Math.round(progress.get() * 100) + "%");

const view = (
  <Container id="progress" direction="column">
    <Text>{message}</Text>
    <Progress progress={progress} />
  </Container>
);

progress.set(0.75);
~~~

Use get() dentro de uma view ou effect() para registrar dependência. Use
peek() em callbacks quando a leitura não deve fazer a view depender do sinal.
batch() agrupa várias alterações:

~~~ts
batch(() => {
  firstName.set("Ada");
  lastName.set("Lovelace");
});
~~~

Para estado de aplicação, createSlateApp(view, initialState) oferece
getState() e setState(). Para widgets, prefira valores controlados quando o
estado precisa ser compartilhado; defaultValue e os demais defaults são
adequados para formulários pequenos.

## 8. Layout e viewport

O engine portátil usa propriedades semelhantes a Flexbox:

~~~tsx
<Container
  id="main"
  direction="row"
  wrap="wrap"
  gap={1}
  padding={1}
  justifyContent="space-between"
  alignItems="center"
>
  <Block width="60%" minWidth={20}>Conteúdo</Block>
  <ScrollView width="30%" height={8} overflow="scroll" />
</Container>
~~~

As propriedades mais importantes são direction, wrap, flexGrow, flexShrink,
flexBasis, gap, rowGap, columnGap, padding, margin, width/height, min/max,
position, overflow e scrollLeft/scrollTop. Dimensões podem ser números,
porcentagens ou auto quando o host as aceita.

app.setViewport({ width, height }) recalcula layout. Um evento resize
normalizado faz a mesma operação antes de chamar onResize.

~~~ts
app.dispatch({ kind: "resize", width: 120, height: 40 });
app.flush();
console.log(app.getViewport());
~~~

Quando Yoga já é uma dependência do projeto, injete-o com
createYogaLayoutEngine(yogaRuntime). Não instale Yoga apenas para uma tela
simples: o engine portátil cobre os casos comuns e torna os testes mais
determinísticos.

## 9. Eventos, bubbling e disabled

O contrato de evento é o mesmo em TSX sem React e no reconciler React:

~~~ts
interface SlateEvent {
  kind: "key" | "mouse" | "resize" | "paste" | "ime"
    | "focusGained" | "focusLost";
  code?: string;
  text?: string;
  phase?: "press" | "repeat" | "release";
  modifiers?: number; // SHIFT=1, CONTROL=2, ALT=4, SUPER=8
  action?: "press" | "release" | "drag" | "move" | "scroll";
  button?: "left" | "right" | "middle" | "other";
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  deltaX?: number;
  deltaY?: number;
  target?: string | number;
}
~~~

O resultado de um handler tem significado operacional:

| Resultado | Efeito |
| --- | --- |
| "ignored" ou undefined | não consome; o evento continua subindo |
| "consumed" | encerra o dispatch sem render obrigatório |
| "render" | encerra o dispatch e agenda render |
| "exit" | encerra o router/controller |

Em um nó, a ordem é onEvent, handler específico (onKey, onMouse, onResize,
etc.), controller de widget e comportamento default do widget.
subscribeInput roda antes do hit-test e é apropriado para atalhos globais.

disabled=true impede foco, handlers do nó e comportamento default. O nó
disabled não bloqueia um ancestor habilitado: depois de ignorá-lo, o evento
continua no caminho de bubbling. Isso permite que um painel ainda possa fechar
um modal mesmo quando o clique caiu sobre um controle desabilitado.

~~~tsx
<Container
  id="panel"
  onEvent={event => event.kind === "mouse" ? "consumed" : "ignored"}
>
  <Button id="busy" disabled={loading.get()}>Enviar</Button>
</Container>
~~~

## 10. Mouse, hit-test e foco

O binding nativo só envia mouse depois de enableMouseCapture(). As
coordenadas são zero-based, como as colunas/linhas do crossterm. O hit-test:

- usa o layout calculado, não a posição intrínseca do texto;
- respeita visible, modal fechado, clipping e scroll;
- visita o último filho primeiro, portanto o overlay visual fica no topo;
- retorna o caminho do alvo para o root;
- não dispara handlers para coordenadas fora da área renderizada.

Para inspecionar o resultado:

~~~ts
const tree = app.getTree();
const layout = app.getLayout();
if (tree && layout) {
  const path = hitTest(tree, layout, 10, 3);
  console.log(path.map(node => node.id)); // alvo → pai → root
}
~~~

Um clique esquerdo focaliza o primeiro elemento focusable do caminho. O evento
recebido pelo handler inclui event.target, que é o ID do alvo mais profundo.
Tab e Shift+Tab percorrem a ordem de elementos focalizáveis.

~~~tsx
<Input
  id="search"
  focusable
  onMouse={event => {
    if (event.action === "press") console.log("alvo", event.target);
    return "ignored";
  }}
  onFocus={() => console.log("foco entrou")}
  onBlur={() => console.log("foco saiu")}
/>
~~~

onHover é chamado quando o alvo com onHover muda durante um movimento.
Coloque-o no controle que deve reagir ao ponteiro, e não em todo container
decorativo. Para estado de hover persistente, atualize um signal e retorne
"render":

~~~tsx
const hovered = signal(false);
const button = Button({
  id: "download",
  background: computed(() => hovered.get() ? "#155e75" : "#0f172a"),
  onHover: () => { hovered.set(true); return "render"; }
});
~~~

Para um estado de saída completo, combine onHover com o movimento em um
handler global e o target do evento; o runtime não inventa um ID para uma
coordenada que está fora do hit-test.

## 11. Normalização e deduplicação de eventos

Fontes customizadas e terminais diferentes podem escrever Moved, move, Left,
left, Down ou press. normalizeEvent() converte esses aliases, normaliza
coordenadas inteiras, preenche modifiers e atribui um ID.

~~~ts
const event = normalizeEvent({
  kind: "mouse",
  action: "Moved" as never,
  button: "Left" as never,
  x: 4.8,
  y: 2.2
});
// { action: "move", button: "left", x: 4, y: 2, modifiers: 0, id: ... }
~~~

createInputRouter aplica esse normalizador automaticamente. Ele apenas
normaliza: dois eventos consecutivos iguais são duas entregas reais
(repetição de tecla, digitação rápida, scroll) e chegam os dois ao app.
sameEvent(a, b) e semanticEventKey(event) estão disponíveis para adaptadores
e testes; id não participa da comparação.

~~~ts
const source = createNormalizedInput(legacySource);
const router = createInputRouter(app, source);
~~~

Uma fonte que comprovadamente entrega o mesmo evento duas vezes pode pedir a
deduplicação semântica com createNormalizedInput(source, { deduplicate: true }).
A janela é consecutiva: um poll() que retorna null libera o próximo evento
igual. Não ligue essa opção por precaução, porque ela descarta repetição de
tecla legítima.

## 12. Texto multiline, largura e wrapping

Texto explícito com \n ocupa linhas distintas. O renderer mede em células de
terminal e quebra por grapheme, não por unidade UTF-16:

~~~tsx
<Text id="description" width={12}>
  Olá 👩‍💻 — texto que pode ocupar várias linhas.
</Text>
~~~

O padrão é wrapText=true. Defina wrapText=false quando a aplicação preferir
truncar o conteúdo no clip do host:

~~~tsx
<Text id="status" width={20} wrapText={false}>
  uma linha longa de status
</Text>
~~~

Um grapheme pode conter emoji com ZWJ, flags, variation selectors e marcas
combinantes. A Slate não divide esses agrupamentos no meio. Para layout que
precisa de altura previsível, informe height; caso contrário, o engine portátil
calcula a altura intrínseca a partir da largura disponível.

## 13. LogView: linhas, estilos e links

LogView aceita strings para compatibilidade e objetos ricos para logs reais.
Cada objeto pode ter text, style, link, runs ou o alias spans.

~~~tsx
import { LogView, signal } from "@slate-terminal/react";
import type { LogLine } from "@slate-terminal/react";

const lines = signal<readonly LogLine[]>([
  { text: "iniciando serviço", style: { dim: true } },
  {
    runs: [
      { text: "[ok] ", style: { bold: true, foreground: "#4ade80" } },
      { text: "deploy concluído em " },
      { text: "example.com", link: "https://example.com" }
    ]
  },
  { text: "atenção", style: { foreground: "#facc15", underline: true } }
]);

const view = <LogView id="logs" lines={lines} follow />;

lines.update(current => [...current, {
  runs: [{ text: "novo evento", style: { italic: true } }]
}]);
~~~

LogView cria uma linha por item, mantém runs na ordem e usa OSC 8 para
hiperlinks. URLs com caracteres de controle são descartadas para não permitir
que dados de log injetem sequências arbitrárias no terminal. follow mantém o
scroll no final; use follow=false para preservar uma posição controlada.

Para logs apenas textuais e limitados, createScrollback(maxLines) continua
sendo o helper mais simples:

~~~ts
const history = createScrollback(5_000);
history.append(chunkFromProcess);
const view = LogView({ id: "logs", lines: history.lines });
~~~

Use um signal<readonly LogLine[]> quando styles/links forem necessários. Não
concatene ANSI manualmente dentro de text: isso impede o renderer de controlar
clipping, wrapping e reset de estilo.

## 14. Widgets

Os widgets prontos são Input, Select, Checkbox, Tabs, Table, List, ScrollView,
Modal, Form, Progress, Spinner, Image, Video e Media.

Widgets controlados recebem signals:

~~~tsx
const selected = signal(0);
const accepted = signal(false);

const form = (
  <Form id="form" direction="column" gap={1}>
    <Select
      id="environment"
      options={[{ label: "Local" }, { label: "Produção" }]}
      selectedIndex={selected}
      onChange={value => selected.set(value)}
    />
    <Checkbox
      id="terms"
      label="Aceito"
      checked={accepted}
      onChange={value => accepted.set(value)}
    />
  </Form>
);
~~~

Input usa graphemes para apresentação, paste e IME; o cursor visual é
calculado em células. Para um editor especializado, use
createInputController() e conecte o controller na propriedade controller.

## 15. Imagens e frames de vídeo

O runtime pode posicionar imagens em terminais que implementam Kitty ou iTerm2.
O grid continua renderizando o `alt` como fallback, então a interface segue
legível em terminais sem suporte visual:

~~~ts
import { Image, Video, loadMediaFile } from "@slate-terminal/react";

const cover = loadMediaFile("./assets/cover.png");
const view = Image({ id: "cover", source: cover, width: 32, height: 12,
  protocol: "auto", alt: "capa do projeto" });

const frames = [loadMediaFile("./assets/01.png"), loadMediaFile("./assets/02.png")];
const preview = Video({ id: "preview", frames, width: 32, height: 12,
  protocol: "kitty", alt: "preview animado" });
~~~

`loadMediaFile` lê o arquivo local uma vez e guarda bytes tipados no source;
uma string base64 sem data URI pode ser usada com `mimeType` no componente;
um caminho nunca é concatenado na saída ANSI. `Video` trabalha com frames de
imagem fornecidos pela aplicação e o controller os anima. Decodificação de
MP4/WebM, conversão de pixels e Sixel ficam fora do core para não vender
compatibilidade inexistente; sem um protocolo aceito, o fallback textual é o
comportamento esperado.

Controles interativos capturam o ponteiro por padrão: `press`, `drag` e
`release` continuam chegando ao alvo mesmo quando o cursor sai da área dele.
Defina `capturePointer: false` quando um componente precisar apenas de eventos
locais.

## 16. React 18 e React 19

O adapter (createReactAdapter/createSlateReactRenderer) aceita a namespace
React explicitamente e funciona com React 18 e React 19 sem importar React no
runtime Slate:

~~~ts
import React from "react";
import { createSlateReactRenderer, Text } from "@slate-terminal/react";

const slateReact = createSlateReactRenderer(React);
const value = slateReact.toReact(Text({ text: "ponte" }));
~~~

Para montar elementos React reais no terminal, use o reconciler correspondente
à sua major:

| React | react-reconciler | peer range |
| --- | --- | --- |
| 18.x | 0.29.x | `^18.3.0` + `^0.29.2` |
| 19.x | 0.31.x | `^19.0.0` + `^0.31.0` |

Exemplo de instalação:

~~~powershell
# React 18
npm install react@18 react-reconciler@0.29

# React 19
npm install react@19 react-reconciler@0.31
~~~

O peer range da Slate recusa qualquer outra linha, mas npm não sabe expressar
"React 18 exige 0.29 e React 19 exige 0.31": um par cruzado ainda instala. Por
isso createReactTerminalRoot compara a major de React instalada com a major
para a qual o reconciler foi construído e recusa o par indicando a linha
correta. checkReactCompatibility(reactVersion, reconcilerReactRange,
createContainerArity) expõe a mesma decisão sem criar um root, útil em
diagnóstico e testes. Para React 18 sem reconciler terminal, use
createReactAdapter.

O reconciler terminal recebe elementos React. Uma maneira agnóstica de criar
hosts é usar strings de host e React.createElement:

~~~tsx
import React from "react";
import { createReactTerminalRoot } from "@slate-terminal/react";

const root = await createReactTerminalRoot({
  viewport: { width: 80, height: 24 }
});

root.render(
  React.createElement(
    "container",
    { id: "app", direction: "column", gap: 1 },
    React.createElement("text", { id: "title", text: "React no terminal" })
  )
);

await Promise.resolve();
root.app.subscribe(() => {
  process.stdout.write(root.app.renderAnsi({ clear: false }));
});

root.close();
~~~

Para uma sessão integrada com input/output, renderReact(element, options)
monta o React antes de iniciar o controller, portanto o primeiro write não é
um frame vazio:

~~~ts
import { createInputSource } from "@slate-terminal/core";

const session = await renderReact(element, {
  viewport: { width: 80, height: 24 },
  input: createInputSource(),
  output: { write: value => process.stdout.write(value) }
});

session.close();
~~~

Não misture o JSX runtime Slate com o reconciler React na mesma árvore. JSX
Slate produz VNodes próprios; o reconciler React espera elementos React reais.
Escolha um caminho por root.

## 17. Adaptação de renderers antigos

Para um renderer textual legado com assinatura (text, options) => string, use
o helper oficial do core:

~~~ts
import { createLegacyRendererAdapter } from "@slate-terminal/core";

const oldRenderer = (text: string, options?: { foreground?: string }) =>
  (options?.foreground ?? "default") + ":" + text;

const renderer = createLegacyRendererAdapter(oldRenderer, {
  foreground: "#38bdf8"
});
renderer("Slate");
~~~

Para um componente antigo que já gera conteúdo Slate, use adaptLegacyRenderer
no pacote React:

~~~tsx
import { adaptLegacyRenderer } from "@slate-terminal/react";
import type { NodeProps } from "@slate-terminal/react";

const LegacyNotice = adaptLegacyRenderer(
  props => "LEGACY: " + String(props.children ?? ""),
  { type: "block", defaults: { foreground: "#94a3b8" } }
);

const view = <LegacyNotice id="notice">mensagem</LegacyNotice>;
~~~

O adapter acrescenta host, ID, layout e props de evento ao resultado. Use
mapProps para converter nomes antigos:

~~~ts
const LegacyButton = adaptLegacyRenderer(
  props => String(props.label ?? ""),
  {
    type: "text",
    mapProps: props => ({
      text: String(props.label ?? ""),
      onPress: props.onClick as NodeProps["onPress"]
    })
  }
);
~~~

Quando o renderer antigo já retorna uma árvore Slate completa, passe
{ wrap: false } e controle os IDs nessa árvore. Não duplique a camada de host
sem necessidade.

## 18. O que evitar

- Não use IDs aleatórios dentro de uma view que é recriada a cada signal; isso
  transforma updates simples em replace e quebra foco.
- Não trate event.code como posição do mouse; use x, y, action e event.target.
- Não compare eventos por id quando o objetivo é deduplicação semântica; use
  sameEvent/semanticEventKey.
- Não use String.prototype.length ou [...text] para medir células de terminal.
  Grapheme e largura visual não são a mesma coisa.
- Não escreva diretamente no stdout em cada callback de estado; inscreva-se no
  commit/controller e deixe o output deduplicar frames.
- Não mantenha raw mode, mouse capture ou alternate screen depois de fechar o
  app. Chame controller.close() e closeTerminal().
- Não espere que disabled execute onEvent; coloque lógica global no pai ou em
  subscribeInput.
- Não misture duas fontes que leem o mesmo input sem normalização: o mesmo
  clique pode chegar como dois aliases ou como objetos distintos.
- Não use deduplicate: true para consertar entrada dupla: igualdade de conteúdo
  não distingue entrega duplicada de repetição legítima. Corrija a fonte.

## 19. Testes e diagnóstico

Validação local completa:

~~~powershell
npm run build
npm run typecheck
npm test
npm run test:windows
npm run benchmark:check
cargo fmt --all -- --check
cargo test --workspace
cargo clippy --workspace --all-targets --all-features -- -D warnings
~~~

O teste Windows executa o mesmo fixture via cmd.exe e Windows PowerShell. Para
testar uma fonte customizada sem terminal físico, use um array de eventos:

~~~ts
const events = [
  { kind: "resize", width: 100, height: 30 },
  { kind: "mouse", action: "Moved", x: 4, y: 2 },
  { kind: "key", code: "c", modifiers: 2 }
];

const source = { poll: () => events.shift() ?? null };
const router = createInputRouter(app, source, 0);
router.start();
~~~

Teste separadamente layout, hit-test, resize, output e reconciler React. Um
teste de app não deve depender de cursor físico ou de largura do terminal do
desenvolvedor.

## 20. Capacidades do terminal

Terminais discordam sobre cor, unicode, mouse, imagem e hyperlink. Em vez de
adivinhar em cada ponto do código, resolva uma vez:

~~~ts
import { capabilityMatrix, describeCapabilities, detectTerminalCapabilities } from "@slate-terminal/react";

const capabilities = detectTerminalCapabilities();
console.error(describeCapabilities(capabilities));
// windows-terminal@win32 cores=truecolor unicode=sim mouse=sim imagem=none tty=sim
~~~

A detecção é uma função pura de `env`, `platform` e `isTty`. Passe esses
valores para testar qualquer terminal sem instalá-lo:

~~~ts
const legacy = detectTerminalCapabilities({ platform: "win32", env: {}, isTty: true });
legacy.terminal;  // "conhost"
legacy.colors;    // "256"
legacy.unicode;   // false
~~~

Entregue o resultado ao renderer e a saída se ajusta sozinha: a cor cai para
`38;5;n`, para as oito cores base ou desaparece, e as bordas viram ASCII
quando o console não garante box drawing.

~~~ts
const frame = app.renderAnsi({ capabilities });
// ou explicitamente
const plain = app.renderAnsi({ colors: "none", unicode: false });
~~~

`capabilityMatrix()` devolve a matriz que o runtime assume por terminal, útil
para documentar o suporte da sua aplicação.

## 21. Cache e pré-aquecimento

Medir texto é o trabalho mais repetido de um frame. A Slate memoriza
segmentação, largura, quebra de linha e sequências SGR em caches com limite
declarado, e guarda em disco o que vale a pena reaproveitar entre execuções.

A raiz do cache é única por versão e segue a convenção do sistema operacional:
`%LOCALAPPDATA%\slate-terminal\v2.3` no Windows,
`~/Library/Caches/slate-terminal/v2.3` no macOS e
`$XDG_CACHE_HOME/slate-terminal/v2.3` no Linux. As entradas são arquivos
planos em um único diretório; nenhuma execução cria pasta nova.

~~~ts
import { createSessionScratch, openDiskCache } from "@slate-terminal/react";

const cache = openDiskCache();          // { dir, get, set, sweep, stats, clear }
cache.set(cache.key("layout", 80, 24), JSON.stringify(snapshot));
cache.sweep();                          // validade, contagem e tamanho

const scratch = createSessionScratch();  // um diretório por sessão
try {
  scratch.file("frame.txt", frame);
} finally {
  scratch.close();                       // removido também na saída do processo
}
~~~

`SLATE_CACHE_DIR` troca a raiz e `SLATE_CACHE=0` desliga o disco inteiro —
útil em CI e em ambientes somente leitura, onde a API continua funcionando com
`enabled: false`.

O pré-aquecimento usa esse cache para encurtar o primeiro frame:

~~~ts
import { prewarm, recordPrewarmSamples } from "@slate-terminal/react";

recordPrewarmSamples(["Salvar", "Cancelar", "Configurações"]);
const controller = new AbortController();
const result = await prewarm({ viewport, budgetMs: 50, signal: controller.signal });
result.cancelled;  // true se o orçamento ou o sinal interromperam
~~~

O aquecimento roda fora do caminho crítico, para em `budgetMs` ou no sinal, e
o que já aqueceu permanece aquecido. `prewarmSync()` existe para quando a
aplicação prefere bloquear. Nenhum dos dois muda a saída: `clearTextCaches()`
e `clearFrameBuffer()` devolvem o runtime ao estado frio e o frame é o mesmo.

## 22. Console de baixo nível

Quando a árvore de componentes não é o que você quer, use o console direto. Ele
dá modos, cursor, buffers, região de rolagem, título, escrita crua, entrada
bruta e tamanho, com o mesmo cuidado de encerramento do controller.

~~~ts
import { ANSI, openConsole, openInteractiveConsole } from "@slate-terminal/react";

const terminal = openInteractiveConsole();  // raw + alternate + mouse + paste + foco
try {
  terminal.cursorTo(0, 0);
  terminal.write("pronto");
  const stop = terminal.onData(chunk => process.stderr.write(JSON.stringify(chunk)));
  const stopResize = terminal.onResize(viewport => app.setViewport(viewport));
  stop();
  stopResize();
} finally {
  terminal.close();  // desfaz cada modo na ordem inversa; idempotente
}
~~~

`openConsole()` abre sem ligar nada, para quando você quer escolher os modos
um a um. `ANSI` constrói sequências sem tocar em stream algum, o que o torna
testável:

~~~ts
ANSI.cursorTo(4, 2);          // "\u001b[3;5H"
ANSI.alternateScreen(false);  // "\u001b[?1049l"
~~~

Cada modo ligado empilha sua restauração; `close()` as executa na ordem
inversa e também roda na saída do processo, então uma falha no meio do caminho
não deixa o terminal em raw mode.

## 23. Extensões e bibliotecas de terceiros

Uma biblioteca pode registrar tipos de nó próprios. O layout mede exatamente as
linhas que o widget imprime e os eventos chegam depois dos handlers do nó, como
em qualquer widget do núcleo.

~~~ts
import { createWidget, registerExtension, runExtensionConformance } from "@slate-terminal/react";

const sparkline = {
  type: "sparkline",
  defaultProps: { focusable: true },
  text: node => [bars(node.props.values)],
  handleEvent: (node, event) => (event.kind === "key" && event.code === "Space" ? "consumed" : "ignored")
};

const report = runExtensionConformance({ name: "minha-lib", widgets: [sparkline] });
if (!report.passed) throw new Error(JSON.stringify(report.checks.filter(check => !check.passed)));

const registration = registerExtension({ name: "minha-lib", version: "1.0.0", widgets: [sparkline] });
const Sparkline = createWidget(sparkline);
// ...
registration.dispose();  // remove widgets, classes e o teardown do setup
~~~

Regras do contrato:

- O `type` não pode ser um dos tipos do núcleo; a tentativa é um erro.
- `text()` precisa ser determinístico para a mesma entrada: layout e pintura
  chamam a mesma função e precisam concordar.
- Sequências de controle na saída de `text()` são removidas pelo renderer; a
  suíte de conformidade reprova a extensão que as emite.
- `dispose()` devolve o registro ao estado anterior, inclusive quando a mesma
  extensão foi registrada duas vezes.

## 24. Tema e componentes compostos

As cores dos componentes são tokens, com os mesmos valores padrão de antes:

~~~ts
import { Gauge, KeyHint, StatusBar, Tree, setTheme, withTheme } from "@slate-terminal/react";

setTheme({ colors: { surface: "#101828", primary: "#7dd3fc" }, border: "rounded" });

const painel = Panel({ id: "painel", title: "Recursos", children: [
  Gauge({ id: "cpu", label: "CPU", value: cpu, max: 1, size: 24 }),
  Tree({ id: "arquivos", nodes: [{ label: "src", children: [{ label: "index.ts" }] }] }),
  StatusBar({ id: "status", left: "pronto", right: "v2.3.0" }),
  KeyHint({ id: "atalhos", hints: [{ key: "^C", label: "sair" }, { key: "Tab", label: "próximo" }] })
] });
~~~

O tema vive em um signal: trocá-lo durante a sessão re-renderiza quem o lê.
`withTheme(tema, corpo)` aplica um tema apenas dentro do bloco e restaura o
anterior, inclusive quando o corpo lança.

`flattenTree(nodes)` devolve as linhas visíveis com profundidade e estado de
expansão, para quem precisa da navegação por índice do `Tree`.

## 25. Referência rápida da API

Runtime: render, createApp, createSlateApp, mount, unmount, close, flush,
getTree, getLayout, setViewport, update, append, remove, dispatch, focus, blur,
scroll, renderAnsi.

Entrada: createInputSource, createNormalizedInput, normalizeEvent, sameEvent,
semanticEventKey, createInputRouter, useInput, hitTest, useFocus,
useFocusManager, useWindowSize.

Terminal: createTerminalController, createTerminal, createSlateOutput,
closeTerminal, enableRawMode, enableMouseCapture, enableBracketedPaste,
enableFocusChange, enableAlternateScreen.

Visual: renderTreeToAnsi, TextStyle, LogLine, LogRun, LogView, wrapText, Glow,
ColorShift.

React: createReactAdapter, createSlateReactRenderer, createReactTerminalRoot,
renderReact, adaptLegacyRenderer.

Capacidades: detectTerminalCapabilities, capabilityMatrix, describeCapabilities,
colorParameters, ansi256Index, ansiBasicIndex.

Cache: createMemoryCache, openDiskCache, resolveCacheRoot, createSessionScratch,
hashKey, cacheEnabled, clearTextCaches, textCacheStats, clearFrameBuffer.

Pré-aquecimento: prewarm, prewarmSync, recordPrewarmSamples, warmTextCaches,
warmString.

Console: openConsole, openInteractiveConsole, ANSI.

Extensões: registerExtension, registerWidget, createWidget, getWidget,
listExtensions, listWidgets, clearExtensions, runExtensionConformance.

Tema e componentes: createTheme, setTheme, getTheme, peekTheme, withTheme,
resetTheme, themeColor, themeSpacing, Gauge, KeyHint, StatusBar, Tree,
flattenTree.

Quando uma API tiver dúvida de comportamento, observe primeiro o contrato de
evento e o layout exposto por getLayoutNode(id). A Slate foi desenhada para
que input, foco, layout e apresentação possam ser inspecionados sem depender
de efeitos colaterais do terminal.
