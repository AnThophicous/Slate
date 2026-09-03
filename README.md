# Slate

[![CI](https://github.com/AnThophicous/Slate/actions/workflows/ci.yml/badge.svg)](https://github.com/AnThophicous/Slate/actions/workflows/ci.yml) [![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE) [![Rust](https://img.shields.io/badge/Rust-1.85%2B-orange.svg)](https://www.rust-lang.org/) [![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)

Slate 2.2.0 é um toolkit de interfaces interativas para terminal escrito em Rust, com runtime nativo para Node.js e uma API TypeScript/TSX que funciona sem React. Teclado, mouse, paste, resize e foco usam o mesmo contrato de eventos.

O modelo visual principal chama-se Slate Mosaic: uma árvore de containers e elementos com IDs estáveis, layout Flexbox, reconciliação incremental e atualização reativa. O Mosaic permite construir a interface por blocos, editar qualquer elemento e manter um único ciclo de renderização.

## Instalação

```powershell
npm install @slate-terminal/core @slate-terminal/react @slate-terminal/native
```

O pacote nativo contém os bindings N-API para o sistema operacional publicado. Durante o desenvolvimento local, `npm run native:build` compila o addon para a plataforma atual.

Para uma sessão interativa, `createTerminalSession()` habilita alternate screen,
raw mode, mouse, paste e focus change como uma operação com rollback. O objeto
retornado tem `input` e um `close()` idempotente; passe `input` ao
`createTerminalController()`.

O [guia de produção](docs/guide.md) é a referência aprofundada: explica o
modelo Mosaic, ciclo de vida, encerramento, mouse/hit-test, eventos, foco,
wrapping por grapheme, `LogView`, integração React 18/19, adaptação de APIs
antigas e testes reais.

## TSX sem React

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
    Button({ id: "save", children: "Salvar", onPress: () => process.stdout.write(`Olá, ${name.peek()}\\n`) })
  ]
}), { viewport: { width: 80, height: 24 } });

process.stdout.write(app.renderAnsi());
```

A forma JSX usa o mesmo runtime:

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

Configure `jsxImportSource` como `@slate-terminal/react` no `tsconfig.json`. O runtime JSX não importa React.

## API 2.0

`@slate-terminal/react` expõe `render`, `createApp` e `createSlateApp`, além de `mount`, `unmount`, `flush`, `setState`, `dispatch`, `focus`, `scroll`, `renderAnsi`, `createTerminalController` e subscriptions de commit.

O layout portátil cobre `row` e `column`, `flexGrow`, `flexShrink`, `flexBasis`, `justifyContent`, `alignItems`, `alignContent`, `gap`, padding, margin, dimensões em pontos ou porcentagem, min/max e `overflow` com scroll. Um adaptador opcional aceita um runtime Yoga injetado.

Os sinais `signal`, `computed`, `effect`, `batch` e `untracked` permitem reatividade sem React. Sinais usados na composição reconstroem a árvore necessária; sinais usados em propriedades visuais atualizam apresentação e layout sem forçar uma reconstrução completa. `frameRate` limita commits assíncronos quando uma interface precisa de uma cadência controlada.

Componentes prontos: `Container`, `Block`, `Text`, `Button`, `Input`, `Select`, `Checkbox`, `Tabs`, `Table`, `Spinner`, `Progress`, `Modal`, `ScrollView`, `List`, `Form`, `Glow`, `ColorShift`, `Image`, `Video` e `Media`.

Foco e entrada incluem navegação por Tab/Shift+Tab, mouse por hit-test de layout, atalhos via `onEvent`, paste, IME, cursor, resize e um `createInputRouter` para conectar qualquer fonte síncrona de eventos. `useInput`, `useFocus`, `useFocusManager`, `useCursor` e `useWindowSize` são helpers agnósticos de React.

`Ctrl+C` é o comando de emergência: o dispatch retorna `"exit"` antes dos
handlers e `createTerminalController` fecha o router, desmonta a árvore e
restaura o cursor. Use `controller.close()` (ou `dispose()`) no encerramento
normal e `closeTerminal()` para restaurar os modos nativos.

Eventos de mouse carregam `target` do hit-test e respeitam clipping, scroll,
ordem visual e coordenadas fora da viewport. `normalizeEvent` também aceita
aliases de terminais/Windows e `createNormalizedInput` remove duplicatas
semanticamente iguais. `LogView` aceita tanto `string` quanto linhas com
`style`, `link` e `runs`.

As cores customizadas usam `#RGB` ou `#RRGGBB`. O renderer preserva UTF-8 e calcula largura de glifos para texto largo.

`Glow` e `ColorShift` podem envolver texto ou ser declarados em `effect`; a interpolação é feita por glifo e `createTerminalController` agenda a animação sem emitir frames idênticos.

Imagens podem ser carregadas com `loadMediaFile()` e renderizadas com
`Image({ source, width, height, protocol: "kitty" | "iterm2" })`. Em
terminais sem protocolo de imagem o alt text permanece visível. Uma string
base64 também pode ser usada diretamente com `mimeType`. `Video` aceita
uma sequência de `frames` (imagens); decodificação de MP4/WebM não é embutida no
core para evitar um codec falso ou uma dependência nativa obrigatória.

## Rust

```rust
use slate_core::{Dimension, Element, ElementId, FlexStyle, LayoutEngine, Rect, Size, TextBlock};

let mut root = Element::new(ElementId::new(1), Rect::new(0, 0, 1, 1), TextBlock::new("Slate"))
    .styled(FlexStyle::default().row().gap(1));
root.push(Element::new(ElementId::new(2), Rect::new(0, 0, 1, 1), TextBlock::new("Olá"))
    .styled(FlexStyle::default().width(Dimension::Percent(50))));
let layout = LayoutEngine::layout(&root, Size::new(80, 24));
```

Crates públicos:

- `slate-core`: frames, eventos, elementos, widgets nativos e layout Flexbox.
- `slate-input`: entrada crossterm para teclado, mouse, resize e paste.
- `slate-renderer`: ANSI incremental, delta rendering, deduplicação e throttle.
- `slate-effects`: efeitos opcionais como Glow e ColorShift.
- `slate-node`: binding N-API Rust para Node.js.

## Estabilidade LTS

A linha 2.x evolui de forma aditiva. APIs existentes não são removidas nem mudam de significado dentro da major; recursos novos entram por tipos, funções e métodos novos. Depreciações ficam documentadas e recebem caminho de migração. O contrato de componentes, IDs, eventos e renderer é agnóstico de dispositivo.

## Desenvolvimento

```powershell
npm install
npm run build             # TypeScript/JavaScript, não exige Rust
npm run build:all         # TypeScript/JavaScript + binding nativo
npm run typecheck
npm test
npm run benchmark
cargo fmt --all -- --check
cargo test --workspace
cargo clippy --workspace --all-targets --all-features -- -D warnings
```

Os exemplos ficam em `examples/`, o [guia de produção](docs/guide.md), o guia
de migração em `docs/ink-migration.md` e a especificação da 2.0 em
`docs/slate-2.0.md`. No Windows, `npm run test:windows` executa o fixture em
CMD e PowerShell.

## Licença

Apache License 2.0. Consulte [LICENSE](LICENSE).
