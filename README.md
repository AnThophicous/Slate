# Slate

[![CI](https://github.com/AnThophicous/Slate/actions/workflows/ci.yml/badge.svg)](https://github.com/AnThophicous/Slate/actions/workflows/ci.yml) [![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE) [![Rust](https://img.shields.io/badge/Rust-1.85%2B-orange.svg)](https://www.rust-lang.org/) [![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)

Slate é um toolkit de interfaces interativas para terminal. O núcleo é escrito em
Rust, o runtime é exposto ao Node.js por bindings N-API e a API pública é
TypeScript/TSX. Teclado, mouse, paste, resize e foco chegam à aplicação pelo
mesmo contrato de eventos, em Linux, macOS e Windows.

Versão atual: **2.3.0 — New Libraries and Extensions for React**: ponto de
extensão público para bibliotecas de terceiros, cache em disco com raiz única e
pré-aquecimento, detecção de capacidade por terminal, console de baixo nível e
uma rodada de performance no caminho de medição, layout e saída ANSI
([o que mudou](#230--o-que-mudou)).

## Intenção do projeto

Slate existe para tratar a interface de terminal como uma superfície de aplicação
de verdade, e não como impressão de linhas em sequência. Três decisões definem o
projeto:

1. **O motor não depende de React.** Layout, reconciliação, foco, hit-test de
   mouse e geração de ANSI são do próprio Slate. React é uma integração
   suportada, nunca um requisito de execução.
2. **O trabalho pesado fica em Rust.** Layout Flexbox, delta rendering, medição
   de grapheme e leitura de entrada vivem em crates versionadas e testadas, com
   uma superfície N-API estável para o Node.js.
3. **A API é um contrato, não uma sugestão.** IDs, eventos, props e ciclo de vida
   seguem a política de estabilidade descrita em [API_POLICY.md](API_POLICY.md):
   a linha 2.x evolui de forma aditiva.

O modelo visual chama-se **Slate Mosaic**: uma árvore de containers e elementos
com IDs estáveis, layout Flexbox, reconciliação incremental e atualização
reativa. A interface é construída por blocos, qualquer elemento pode ser editado
isoladamente e existe um único ciclo de renderização.

### Objetivos de engenharia

Estes são os alvos que guiam a evolução do projeto. Cada um é uma decisão de
engenharia com critério de aceitação, não um slogan.

| Objetivo | O que significa na prática |
| --- | --- |
| **Performance alta** | Custo por frame proporcional ao que mudou, não ao tamanho da árvore. Reconciliação indexada por ID, diff estrutural de props, delta rendering por célula e mudanças só de cor que não recalculam layout. Medido por benchmark, não por impressão. |
| **Compatibilidade entre sistemas operacionais** | O mesmo código roda em Linux, macOS e Windows. Diferenças de terminal ficam contidas na camada de entrada e no renderer; a aplicação vê um contrato único de eventos, cores e medidas. Windows é alvo de primeira classe, incluindo CMD e PowerShell. |
| **Renderização visual com cache** | O frame é o resultado de um pipeline visual com cache de medição, layout e saída ANSI. O cache tem um diretório próprio e limite explícito: nada de espalhar pastas novas na Temp a cada execução. |
| **Cache pré-aquecido** | O que é conhecido antes do primeiro frame (métricas de fonte, larguras de grapheme, layout inicial, sequências ANSI recorrentes) é preparado antes de a interface subir, para reduzir o custo do primeiro render. |
| **Componentes próprios completos e customizáveis** | A biblioteca de componentes é do Slate, não um wrapper. Cada componente expõe estilo, comportamento e slots suficientes para ser reaproveitado sem fork. |
| **APIs de baixo nível completas** | Acesso direto ao terminal para quem precisa de controle total: modos, cursor, buffers, escrita ANSI crua, entrada bruta e ciclo de vida da sessão, sem passar pela árvore de componentes. |

A 2.3.0 executa esses alvos; o que ela entregou e o que continua planejado está
em [2.3.0 — o que mudou](#230--o-que-mudou).

## Arquitetura

| Camada | Pacote / crate | Responsabilidade |
| --- | --- | --- |
| API TypeScript | `@slate-terminal/core` | Contrato estável de componentes, eventos e render em Node.js. |
| Runtime TSX/React | `@slate-terminal/react` | Runtime JSX próprio, sinais, widgets, reconciliação e ponte React. |
| Binding nativo | `@slate-terminal/native` | Addon N-API para a plataforma publicada. |
| Núcleo | `slate-core` | Frames, eventos, elementos, widgets nativos e layout Flexbox. |
| Entrada | `slate-input` | Teclado, mouse, resize e paste via crossterm. |
| Saída | `slate-renderer` | ANSI incremental, delta rendering, deduplicação e throttle. |
| Efeitos | `slate-effects` | Efeitos opcionais como Glow e ColorShift. |
| Ponte | `slate-node` | Exposição N-API do núcleo Rust para Node.js. |

## Instalação

```powershell
npm install @slate-terminal/core @slate-terminal/react @slate-terminal/native
```

O pacote nativo contém os bindings N-API para o sistema operacional publicado.
Em desenvolvimento local, `npm run native:build` compila o addon para a
plataforma atual.

## Início rápido

Para uma sessão interativa, `createTerminalSession()` habilita alternate screen,
raw mode, mouse, paste e focus change como uma operação única com rollback. O
objeto retornado expõe `input` e um `close()` idempotente; passe `input` para
`createTerminalController()`.

```tsx
import { Button, Container, Input, Text, render, signal } from "@slate-terminal/react";

const name = signal("");
const app = render(() => Container({
  id: "app",
  direction: "column",
  gap: 1,
  children: [
    Text({ id: "title", text: "Configurações" }),
    Input({ id: "name", value: name, placeholder: "Seu nome", onChange: value => name.set(value) }),
    Button({ id: "save", children: "Salvar", onPress: () => process.stdout.write(`Olá, ${name.peek()}\n`) })
  ]
}), { viewport: { width: 80, height: 24 } });

process.stdout.write(app.renderAnsi());
```

A forma JSX usa exatamente o mesmo runtime:

```tsx
import { Button, Container, Input, Text, render, signal } from "@slate-terminal/react";

const name = signal("");
const view = (
  <Container id="app" direction="column" gap={1}>
    <Text>Configurações</Text>
    <Input value={name} onChange={value => name.set(value)} />
    <Button onPress={() => name.set("Slate")}>Salvar</Button>
  </Container>
);

const app = render(view, { viewport: { width: 80, height: 24 } });
process.stdout.write(app.renderAnsi());
```

Configure `jsxImportSource` como `@slate-terminal/react` no `tsconfig.json`. O
runtime JSX não importa React.

## API 2.x

`@slate-terminal/react` expõe `render`, `createApp` e `createSlateApp`, além de
`mount`, `unmount`, `flush`, `setState`, `dispatch`, `focus`, `scroll`,
`renderAnsi`, `createTerminalController` e subscriptions de commit.

**Layout.** O layout portátil cobre `row` e `column`, `flexGrow`, `flexShrink`,
`flexBasis`, `justifyContent`, `alignItems`, `alignContent`, `gap`, padding,
margin, dimensões em pontos ou porcentagem, min/max e `overflow` com scroll. Um
adaptador opcional aceita um runtime Yoga injetado.

**Reatividade.** `signal`, `computed`, `effect`, `batch` e `untracked` dão
reatividade sem React. Sinais usados na composição reconstroem apenas a árvore
necessária; sinais usados em propriedades visuais atualizam apresentação e
layout sem reconstrução completa. `computed()` devolve `dispose()` e é liberado
junto do efeito ou do render que o criou. `frameRate` limita commits assíncronos
quando a interface precisa de cadência controlada.

**Componentes.** `Container`, `Block`, `Text`, `Button`, `Input`, `Select`,
`Checkbox`, `Tabs`, `Table`, `Spinner`, `Progress`, `Modal`, `ScrollView`,
`List`, `Form`, `Glow`, `ColorShift`, `Image`, `Video` e `Media`. A camada
composta acrescenta `Stack`, `Row`, `Grid`, `Panel`, `Card`, `Alert`, `Dialog`,
`Menu`, `LogView`, `Gauge`, `KeyHint`, `StatusBar` e `Tree` (com `flattenTree`
para percorrer as linhas visíveis).

**Tema.** As cores dos componentes são tokens: `setTheme`, `getTheme`,
`withTheme` e `themeColor` repintam `Panel`, `Card`, `Badge`, `Divider`,
`Alert`, `Gauge`, `KeyHint` e `StatusBar` sem trocar de componente. Os valores
padrão são exatamente os que os componentes já usavam.

**Foco e entrada.** Navegação por Tab/Shift+Tab, mouse por hit-test de layout,
atalhos via `onEvent`, paste, IME, cursor e resize. `createInputRouter` conecta
qualquer fonte síncrona de eventos; `useInput`, `useFocus`, `useFocusManager`,
`useCursor` e `useWindowSize` são helpers agnósticos de React.

**Encerramento.** `Ctrl+C` é o comando de emergência: o dispatch retorna
`"exit"` antes dos handlers e `createTerminalController` fecha o router,
desmonta a árvore e restaura o cursor. Use `controller.close()` (ou `dispose()`)
no encerramento normal e `closeTerminal()` para restaurar os modos nativos.
Falhas de input, render e output fecham o polling, desmontam o app e tentam
restaurar o terminal; `onError` e `error()` expõem o diagnóstico.

**Eventos.** Eventos de mouse carregam `target` do hit-test e respeitam
clipping, scroll, ordem visual e coordenadas fora da viewport. `normalizeEvent`
aceita aliases de terminais e do Windows; `createNormalizedInput` adapta
qualquer fonte ao contrato canônico, com deduplicação semântica opcional via
`{ deduplicate: true }`. `LogView` aceita `string` ou linhas com `style`, `link`
e `runs`.

**Texto, cores e mídia.** Cores customizadas em `#RGB` ou `#RRGGBB`. O renderer
preserva UTF-8 e calcula largura de glifos para texto largo. `Glow` e
`ColorShift` envolvem texto ou são declarados em `effect`, com interpolação por
glifo e sem emitir frames idênticos. Imagens são carregadas com
`loadMediaFile()` e renderizadas com
`Image({ source, width, height, protocol: "kitty" | "iterm2" })`; sem protocolo
de imagem, o alt text permanece no grid. Uma string base64 também pode ser usada
diretamente com `mimeType`. `Video` aceita uma sequência de `frames`:
decodificação de MP4/WebM não é embutida no core, para não introduzir um codec
falso nem uma dependência nativa obrigatória.

## Capacidades e portabilidade

`detectTerminalCapabilities()` resolve, a partir do ambiente, o que o terminal
aceita: profundidade de cor, unicode, glifos largos, mouse, paste, foco,
alternate screen, hyperlinks e protocolo de imagem. A detecção é uma função
pura de `env`, `platform` e `isTty`, então a matriz de suporte é testável sem
instalar o terminal — `capabilityMatrix()` devolve a mesma matriz que o
runtime usa.

```ts
import { detectTerminalCapabilities, renderTreeToAnsi } from "@slate-terminal/react";

const capabilities = detectTerminalCapabilities();
const frame = renderTreeToAnsi(tree, layout, viewport, { capabilities });
```

O renderer degrada de acordo: truecolor vira `38;5;n` em terminais de 256
cores, vira uma das oito cores base no console mínimo e desaparece quando a cor
está desligada (`NO_COLOR`, `TERM=dumb`, saída sem TTY). Sem garantia de box
drawing — o caso do CMD legado — as bordas saem em ASCII em vez de virar bloco
de substituição. `colors`, `unicode` e `capabilities` também podem ser passados
diretamente em `renderAnsi`.

## Cache e pré-aquecimento

Medição de texto, larguras de grapheme, quebra de linha e sequências SGR ficam
em caches com limite declarado. O disco tem uma raiz única por versão, na
convenção do sistema operacional:

| Sistema | Raiz |
| --- | --- |
| Windows | `%LOCALAPPDATA%\slate-terminal\v2.3\` |
| macOS | `~/Library/Caches/slate-terminal/v2.3/` |
| Linux | `$XDG_CACHE_HOME/slate-terminal/v2.3/` (ou `~/.cache`) |

As entradas são arquivos planos dentro de um único diretório `entries`, com
limpeza por validade, por número de entradas e por tamanho. Cada sessão tem no
máximo um diretório de scratch, removido no `close()`, na saída do processo e
pela próxima sessão que o encontrar abandonado — nenhuma execução deixa pasta
nova para trás. `SLATE_CACHE_DIR` troca a raiz e `SLATE_CACHE=0` desliga o
disco.

```ts
import { openDiskCache, prewarm } from "@slate-terminal/react";

// Fora do caminho crítico: aquece as amostras da execução anterior e para no
// orçamento ou no sinal de cancelamento.
const result = await prewarm({ viewport, samples: ["Salvar", "Cancelar"], budgetMs: 50 });
openDiskCache().sweep();
```

`prewarmSync()` faz o mesmo de forma bloqueante, e `recordPrewarmSamples()`
registra o texto que a aplicação vai desenhar para o próximo início.

## Console de baixo nível

`openConsole()` e `openInteractiveConsole()` dão acesso direto ao terminal sem
passar pela árvore de componentes: modos, cursor, buffers, região de rolagem,
título, escrita ANSI crua, entrada bruta e tamanho. `close()` é idempotente e
desfaz cada modo na ordem inversa, inclusive na saída do processo.

```ts
import { ANSI, openInteractiveConsole } from "@slate-terminal/react";

const terminal = openInteractiveConsole();
try {
  terminal.cursorTo(0, 0);
  terminal.write(`${ANSI.clear("after")}pronto`);
} finally {
  terminal.close();
}
```

`ANSI` é um construtor puro de sequências: nada nele toca em um stream, então
serve tanto para escrever quanto para testar. Em `examples/node/lowlevel.mjs`
essa camada aparece junto com capacidades, pré-aquecimento e uma extensão.

## Extensões

Um tipo de nó de terceiro é registrado com o mesmo contrato dos widgets do
núcleo: o layout mede exatamente as linhas que ele imprime e os eventos chegam
depois dos handlers do nó.

```ts
import { createWidget, registerExtension, runExtensionConformance } from "@slate-terminal/react";

const sparkline = {
  type: "sparkline",
  text: node => [renderBars(node.props.values)]
};

const report = runExtensionConformance({ name: "minha-lib", widgets: [sparkline] });
const registration = registerExtension({ name: "minha-lib", version: "1.0.0", widgets: [sparkline] });
const Sparkline = createWidget(sparkline);
```

`runExtensionConformance()` é a suíte de conformidade: verifica que o type não
colide com o núcleo, que `text()` é determinístico, que a saída não injeta
sequências de controle e que `dispose()` devolve o registro ao estado anterior.
Os tipos do núcleo são reservados; tentar redefinir um deles é erro.

## Integração com React

React é opcional e tratado como integração de primeira classe, não como base do
runtime. Duas portas de entrada:

- `createReactAdapter(React)` — React consome nós Slate, sem reconciliador.
- `createReactTerminalRoot(...)` — React real controla a árvore via
  `react-reconciler`.

| React | `react-reconciler` | peer range |
| --- | --- | --- |
| 18.x | 0.29.x | `^18.3.0` + `^0.29.2` |
| 19.x | 0.31.x | `^19.0.0` + `^0.31.0` |

Os peer ranges excluem as demais linhas, mas o npm não consegue expressar que
React 18 exige 0.29 e React 19 exige 0.31, então um par cruzado ainda instala.
`createReactTerminalRoot` recusa o par cruzado e informa a linha correta;
`checkReactCompatibility()` expõe a mesma decisão sem criar um root. Fechar o app
Slate desmonta a árvore React e executa os cleanups dos componentes.
`npm run test:react18` roda a suíte de React 18 contra o workspace privado
`tests/react18`, com as versões travadas no lockfile da raiz e sem acesso à rede.

## 2.3.0 — o que mudou

O anúncio da versão é **aceitar o ecossistema React por completo**: além de
renderizar componentes React, o Slate agora tem um ponto de extensão público
para bibliotecas de terceiros rodarem sobre o runtime de terminal. Em volta
desse anúncio, a versão executa os
[objetivos de engenharia](#objetivos-de-engenharia) do projeto.

### 1. Ecossistema React

- Ponto de extensão público: `registerExtension`, `registerWidget` e
  `createWidget` registram tipos de nó de terceiros com os mesmos IDs,
  medição, eventos e ciclo de vida dos widgets do núcleo.
- Suíte de conformidade executável (`runExtensionConformance`): uma biblioteca
  verifica antes de publicar se cumpre o contrato.
- Componentes React que não dependem de DOM continuam rodando pelo
  reconciliador, com a matriz de compatibilidade 18/19 verificada em CI.
- **Ainda planejado:** pacotes de extensão oficiais publicados sob
  `@slate-terminal/*` para hooks, roteamento e state managers.

### 2. Performance

- Frame completo (viewport 100x30, árvore pequena): **5,38 ms para 0,56 ms**.
- Layout de 800 filhos: **28,6 ms para 8,3 ms**.
- Render com frame de 500 filhos: **39,8 ms para 25,4 ms**.
- Custos quadráticos removidos da pintura, da coleta de foco, do hit-test e da
  quebra de linhas; somas por `spread` viraram laços, então uma árvore com
  dezenas de milhares de filhos não estoura mais a pilha.
- Medições memorizadas por passe, buffer de frame reaproveitado entre frames e
  sequência SGR emitida só quando muda de verdade.
- `npm run benchmark:check` compara cada cenário com o orçamento declarado em
  `benchmarks/budget.json` e falha na regressão. O gate roda no CI.

### 3. Compatibilidade entre sistemas operacionais

- `detectTerminalCapabilities()` e `capabilityMatrix()`: detecção pura do
  ambiente e matriz de suporte documentada por terminal.
- Degradação previsível de cor (truecolor, 256, 8 cores, nenhuma) e bordas
  ASCII quando o console não garante box drawing.
- Windows segue como alvo de primeira classe: o console legado é detectado e a
  saída se ajusta a ele. Slate não chama a Win32 Console API; o que ele faz é
  reconhecer o host e não emitir o que ele não desenha.

### 4. Renderização visual com cache disciplinado

- Cache em memória com limite de entradas, bytes e validade.
- Cache em disco com raiz única por versão, na convenção do sistema
  operacional, entradas planas em um só diretório e limpeza por validade,
  contagem e tamanho.
- Um diretório de scratch por sessão, removido no encerramento, na saída do
  processo e pela sessão seguinte quando ficou órfão.

### 5. Cache pré-aquecido

- `prewarm()` (assíncrono, cancelável por orçamento ou sinal) e
  `prewarmSync()` medem as amostras da execução anterior e desenham um frame
  sintético para encher o buffer e o cache de sequências.
- O primeiro frame aquecido custa entre 30% e 60% do primeiro frame frio,
  conforme a máquina.

### 6. Componentes próprios e APIs de baixo nível

- Tokens de tema aplicados aos componentes existentes, mais `Gauge`,
  `KeyHint`, `StatusBar` e `Tree`.
- `openConsole()` e `openInteractiveConsole()` expõem modos, cursor,
  buffers, escrita crua, entrada bruta e tamanho, com encerramento idempotente
  em ordem inversa.
- Correções de layout que os componentes expunham: tamanho intrínseco passa a
  contar padding, gap e margens, e widgets não controlados com `onChange`
  voltam a avançar.

A 2.3.0 é aditiva: nada que existia na linha 2.x foi removido ou mudou de
significado. O detalhamento por item está no [CHANGELOG](CHANGELOG.md).

## Rust

```rust
use slate_core::{Dimension, Element, ElementId, FlexStyle, LayoutEngine, Rect, Size, TextBlock};

let mut root = Element::new(ElementId::new(1), Rect::new(0, 0, 1, 1), TextBlock::new("Slate"))
    .styled(FlexStyle::default().row().gap(1));
root.push(Element::new(ElementId::new(2), Rect::new(0, 0, 1, 1), TextBlock::new("Olá"))
    .styled(FlexStyle::default().width(Dimension::Percent(50))));
let layout = LayoutEngine::layout(&root, Size::new(80, 24));
```

Crates públicos: `slate-core`, `slate-input`, `slate-renderer`, `slate-effects`
e `slate-node` (ver [Arquitetura](#arquitetura)).

## Desempenho

`npm run benchmark` mede o Slate em Node.js e imprime uma linha JSON por
cenário. A comparação com o Ink é opcional e só roda quando
`SLATE_BENCHMARK_INK` e `SLATE_BENCHMARK_REACT` apontam para uma instalação
real — Ink não é dependência do Slate. Metodologia e ressalvas de leitura estão
em [benchmarks/README.md](benchmarks/README.md).

`npm run benchmark:check` é o gate: compara cada cenário com o orçamento em
`benchmarks/budget.json` e sai com erro quando o frame regride. Em uma máquina
mais lenta, `SLATE_BUDGET_SCALE` alarga o orçamento em vez de exigir edição do
arquivo. O CI roda esse comando a cada push.

## Estabilidade

A linha 2.x evolui de forma aditiva. APIs existentes não são removidas nem mudam
de significado dentro da major; recursos novos entram por tipos, funções e
métodos novos. Depreciações são documentadas e recebem caminho de migração. O
contrato de componentes, IDs, eventos e renderer é agnóstico de dispositivo.

## Documentação

- [Guia de produção](docs/guide.md) — modelo Mosaic, ciclo de vida,
  encerramento, mouse/hit-test, eventos, foco, wrapping por grapheme, `LogView`,
  integração React 18/19, adaptação de APIs antigas e testes reais.
- [Guia de migração do Ink](docs/ink-migration.md)
- [Especificação da 2.0](docs/slate-2.0.md)
- [Política de API](API_POLICY.md) · [Changelog](CHANGELOG.md) ·
  [Contribuição](CONTRIBUTING.md) · [Segurança](SECURITY.md)
- Exemplos executáveis em [`examples/`](examples), incluindo
  [`examples/node/lowlevel.mjs`](examples/node/lowlevel.mjs): capacidades,
  console de baixo nível, pré-aquecimento e uma extensão em um só programa.

## Desenvolvimento

```powershell
npm install
npm run build             # TypeScript/JavaScript, não exige Rust
npm run build:all         # TypeScript/JavaScript + binding nativo
npm run typecheck
npm test
npm run test:react18
npm run benchmark
npm run benchmark:check   # orçamento de frame; falha na regressão
cargo fmt --all -- --check
cargo test --workspace
cargo clippy --workspace --all-targets --all-features -- -D warnings
```

No Windows, `npm run test:windows` executa o fixture em CMD e PowerShell.

## Licença

Apache License 2.0. Consulte [LICENSE](LICENSE).
