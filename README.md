# Slate

[![CI](https://github.com/AnThophicous/Slate/actions/workflows/ci.yml/badge.svg)](https://github.com/AnThophicous/Slate/actions/workflows/ci.yml) [![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE) [![Rust](https://img.shields.io/badge/Rust-1.85%2B-orange.svg)](https://www.rust-lang.org/) [![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)

Slate é um toolkit de interfaces interativas para terminal. O núcleo é escrito em
Rust, o runtime é exposto ao Node.js por bindings N-API e a API pública é
TypeScript/TSX. Teclado, mouse, paste, resize e foco chegam à aplicação pelo
mesmo contrato de eventos, em Linux, macOS e Windows.

Versão atual: **2.2.0**. Próxima versão planejada: **2.3.0 — Coming Up: New
Libraries and Extensions for React**
([roadmap](#roadmap--230-coming-up-new-libraries-and-extensions-for-react)).

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

O estado atual e o que ainda está planejado estão no
[roadmap da 2.3.0](#roadmap--230-coming-up-new-libraries-and-extensions-for-react).

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
`List`, `Form`, `Glow`, `ColorShift`, `Image`, `Video` e `Media`.

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

## Roadmap — 2.3.0: Coming Up: New Libraries and Extensions for React

A 2.3.0 ainda não foi lançada. O anúncio da versão é **aceitar o ecossistema
React por completo**: além de renderizar componentes React, o Slate passa a
aceitar bibliotecas React expansíveis rodando sobre o runtime de terminal. Em
volta desse anúncio, a versão executa os
[objetivos de engenharia](#objetivos-de-engenharia) do projeto: performance,
compatibilidade entre sistemas operacionais, cache disciplinado e pré-aquecido,
componentes próprios mais completos e APIs de baixo nível para controle total
do console.

A versão tem seis frentes, uma por objetivo de engenharia.

### 1. Ecossistema React

- **Bibliotecas React de terceiros no terminal.** Componentes de bibliotecas
  React que não dependam de DOM devem funcionar sobre o reconciliador do Slate,
  sem fork e sem patch.
- **Extensões oficiais.** Pacotes de extensão publicados sob `@slate-terminal/*`
  para hooks, roteamento, state managers e componentes compostos.
- **Ponto de extensão público.** Uma API declarada para registrar widgets, tipos
  de nó e renderers de terceiros, com os mesmos IDs, eventos e ciclo de vida do
  núcleo.
- **Contrato de compatibilidade explícito.** O que uma biblioteca React precisa
  cumprir para ser suportada, mais uma suíte de conformidade que verifica isso.

### 2. Performance

- Custo por frame proporcional ao subconjunto alterado, com o caminho quente de
  medição e diff em Rust.
- Orçamento de frame declarado e verificado por benchmark de regressão no CI,
  em vez de medição pontual.
- Alocação estável no ciclo de render: buffers reaproveitados entre frames,
  sem realocar a árvore inteira a cada commit.

### 3. Compatibilidade entre sistemas operacionais

- Matriz de terminais suportados por sistema operacional, com o comportamento
  esperado documentado por capacidade (cor, mouse, paste, imagem, resize).
- Detecção de capacidade em tempo de execução, com degradação previsível
  quando o terminal não oferece o recurso.
- Windows tratado como alvo de primeira classe: CMD, PowerShell e Windows
  Terminal cobertos por teste, não por suposição.

### 4. Renderização visual com cache disciplinado

- Pipeline visual com cache de medição de texto, layout resolvido e segmentos
  ANSI recorrentes.
- **Um diretório de cache, não uma pasta nova por execução.** Raiz única e
  estável por versão, respeitando a convenção do sistema operacional, com
  limite de tamanho, expiração e limpeza. Arquivos temporários da sessão são
  removidos no encerramento, inclusive em falha.
- Chave de cache derivada do conteúdo, para que duas execuções iguais
  reaproveitem o trabalho em vez de recriá-lo.

### 5. Cache pré-aquecido

- Pré-aquecimento do que é conhecido antes do primeiro frame: larguras de
  grapheme, métricas de fonte, layout inicial e sequências ANSI de uso
  frequente.
- Aquecimento fora do caminho crítico e cancelável, para nunca atrasar o
  primeiro render que deveria acelerar.
- Alvo verificável: custo do primeiro frame comparável ao dos frames
  seguintes, medido pelo mesmo benchmark.

### 6. Componentes próprios e APIs de baixo nível

- Biblioteca de componentes mais completa e customizável, com estilo,
  comportamento e slots expostos, para reaproveitamento sem fork.
- Camada de baixo nível pública para controle total do console: modos de
  terminal, cursor, buffers alternativos, escrita ANSI crua, entrada bruta e
  ciclo de vida da sessão, utilizável sem a árvore de componentes.
- No Windows, essa camada assume o console real (incluindo o CMD), em vez de
  supor um terminal compatível com ANSI.

A 2.3.0 segue a política aditiva da linha 2.x: nada do que existe hoje é
removido nem muda de significado. Cada frente entra por tipos, funções e
métodos novos. O status de cada item fica em [CHANGELOG.md](CHANGELOG.md) até o
lançamento.

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
- Exemplos executáveis em [`examples/`](examples).

## Desenvolvimento

```powershell
npm install
npm run build             # TypeScript/JavaScript, não exige Rust
npm run build:all         # TypeScript/JavaScript + binding nativo
npm run typecheck
npm test
npm run test:react18
npm run benchmark
cargo fmt --all -- --check
cargo test --workspace
cargo clippy --workspace --all-targets --all-features -- -D warnings
```

No Windows, `npm run test:windows` executa o fixture em CMD e PowerShell.

## Licença

Apache License 2.0. Consulte [LICENSE](LICENSE).
