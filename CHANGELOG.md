# Changelog

## [Unreleased]

### Added

- `Image`, `Video` e `Media` com sources tipados, `loadMediaFile()` e saída opcional para Kitty/iTerm2; sem suporte visual, o `alt` segue no grid.
- `createTerminalSession()` para ativar capacidades interativas com rollback e um único caminho de encerramento.
- Captura de ponteiro para `press`/`drag`/`release`, tamanho inicial opcional da fonte e um exemplo Node mais completo.
- Bordas reais (`single`, `double`, `rounded`, `heavy`) no renderer TSX.
- Âncora absoluta das linhas ANSI para impedir deslocamento horizontal entre terminais.

### Changed

- `createNormalizedInput` não deduplica mais por padrão: dois eventos consecutivos iguais são duas entregas reais. Use `{ deduplicate: true }` apenas em fontes que comprovadamente repetem a entrega.
- `NodeProps` perdeu o índice `[property: string]: unknown`, então props inválidas (`width: "banana"`, `disabled: "yes"`) passam a ser erro de tipo em todos os widgets.
- `computed()` devolve `dispose()` e é liberado junto com o efeito ou o render que o criou.
- Peers de React apertados para as linhas realmente suportadas: `react: "^18.3.0 || ^19.0.0"` e `react-reconciler: "^0.29.2 || ^0.31.0"`.
- `createReactTerminalRoot` recusa pares cruzados (React 18 + 0.31, React 19 + 0.29) que o range do npm não consegue excluir; `checkReactCompatibility()` expõe a mesma decisão sem criar um root.
- `TextField` mantém o `id` no `Input` e deriva `<id>:field` para o container; `Grid` só nomeia células quando o próprio grid tem `id`.

### Fixed

- Falhas de input, render e output agora fecham polling, desmontam o app e tentam restaurar o terminal; `onError` e `error()` expõem o diagnóstico.
- O reconciliador React separa props de filhos, remove props que sumiram do render, atualiza texto e trata reordenação como movimento em vez de duplicar nós.
- `createContainer` recebe os três callbacks de erro do react-reconciler 0.31 e a assinatura de 8 argumentos da linha 0.29; Error Boundaries renderizam o fallback sem derrubar o processo, e React 18 volta a aplicar updates. O teste (`npm run test:react18`) roda contra o workspace privado `tests/react18`, com react 18.3.1 e react-reconciler 0.29.2 travados no lockfile da raiz — sem instalação dinâmica nem rede.
- Fechar o app Slate (controller, Ctrl+C ou falha de input) desmonta a árvore React e roda os cleanups dos componentes.
- Erros de render agendado são encaminhados por `subscribeError`/`reportError` em vez de escaparem de um microtask ou timer.
- Widgets não controlados guardam um slot por propriedade: digitação contínua, `cursor` e `value` deixam de se sobrescrever, e o valor interno não passa mais a ser lido como controlado.
- `Select`, `Tabs` e `List` deixam de limitar o índice atual a zero antes de navegar.
- `onEvent` que devolve `"ignored"` volta a deixar o evento seguir para o handler específico e para o comportamento padrão do widget.
- `Tab` e `focus()`/`blur()` emitem frame; o controller religa a animação quando um `Spinner` parado é ligado.
- O layout mede `List`, `Table`, `Modal` e demais widgets pelo texto que o renderer desenha, em vez de tratá-los como uma linha vazia.
- Reconciliação por índice de key/ID e comparação estrutural de props: 4.000 filhos sem mudança saem de ~193 ms com updates falsos para ~13 ms sem operações, e uma mudança só de cor não recalcula layout.
- O adaptador Yoga chama os setters no nó (o receptor era perdido) e libera a subárvore inteira, inclusive quando a medição falha.
- `@slate-terminal/core` e `@slate-terminal/react` compartilham um único contexto reativo: um signal de core lido em uma composição de react atualiza a tela.
- Renderer Rust: o delta compara o grapheme completo, então trocar `a`+U+0301 por `a`+U+0300 repinta a célula.
- `npm run benchmark` mede Ink de verdade quando `SLATE_BENCHMARK_INK`/`SLATE_BENCHMARK_REACT` apontam para uma instalação, em vez de apenas checar disponibilidade.
- Feedback loops de renderização têm limite determinístico (`maxRenderPasses`) em vez de travar o processo.
- Texto externo não consegue injetar sequências de controle ANSI no renderer TypeScript ou Rust.
- Botões e checkboxes não tratam clique direito como ativação.
- O deduplicador de frames permite repetir uma escrita depois de uma falha transitória.

## [2.2.0] - 2026-08-30

Slate 2.2.0 is ready for release. This release hardens terminal lifecycle
management, mouse routing and Unicode rendering across the TypeScript and Rust
stacks, with a detailed production guide and cross-platform regression tests.

### Added

- Emergency `Ctrl+C` shutdown through `app.dispatch`, routers and terminal controllers.
- Semantic input normalization/deduplication, canonical mouse aliases and hit-test `target`.
- Styled/link-aware `LogView`, multiline wrapping by grapheme and grapheme-safe input cursors.
- Official legacy renderer adapters and an explicit React 18/19 reconciler compatibility matrix.
- Windows CMD/PowerShell lifecycle tests plus resize, mouse, Unicode and React reconciler coverage.
- Detailed production guide with lifecycle, API, integration and anti-pattern examples.

### Fixed

- Disabled nodes no longer consume events before enabled ancestors can bubble them.
- Mouse events outside the rendered hit-test area no longer fall back to the root.
- The terminal controller does not emit a transient empty first frame and restores modes on close.

## [2.1.0] - 2026-08-30

Slate 2.1.0 introduced the React terminal reconciler, high-level terminal
APIs, reusable classes, stable node and event identities, richer components,
and improved Unicode grapheme support.

## [2.0.0] - 2026-08-30

### Added

- Slate Mosaic, o modelo de composição por containers, elementos e IDs estáveis.
- Runtime `render`/`createSlateApp` sem React com mount, unmount, flush, estado e subscriptions.
- Signals `signal`, `computed`, `effect`, `batch` e `untracked`.
- Layout Flexbox portátil com row, column, wrap, grow, shrink, gap, porcentagens, min/max, clipping e scroll.
- Adaptador de layout Yoga por injeção opcional.
- Widgets Input, Select, Checkbox, Tabs, Table, Spinner, Progress, Modal, ScrollView, List e Form.
- Foco por Tab/Shift+Tab, hit-test de mouse, paste, IME, cursor, resize e router de entrada.
- Renderer ANSI TSX com UTF-8 e cores RGB hexadecimais.
- Efeitos declarativos `Glow` e `ColorShift` por glifo, com agenda de animação do controller.
- Engine Flexbox equivalente para o núcleo Rust e widgets nativos Input, Select e Checkbox.
- Exemplos, documentação de API 2.0, migração Ink e benchmark de runtime.

### Compatibility

- A API pública existente da linha 1.x permanece disponível nos pacotes e crates compatíveis.
- A evolução 2.x segue política aditiva e documentada.

## [1.5.0] - 2026-08-29

### Added

- Workspace Rust modular com núcleo agnóstico de terminal.
- Eventos unificados para teclado, mouse, resize, paste e foco.
- Frame, estilos, cores ANSI/RGB e renderizador ANSI.
- Adaptador crossterm e binding N-API inicial.
- Facade TypeScript com tipos de eventos e fallback ANSI.
- Política LTS de evolução aditiva.
- Composição por containers, blocos e IDs editáveis.
- Renderização incremental com deduplicação e throttle.
- Efeitos `Glow` e `ColorShift` com transições suaves.
- Helpers de migração Ink e runtime JSX.
- Captura opcional de paste delimitado e mudanças de foco.
- Empacotamento N-API por plataforma para Linux, Windows e macOS.
- Correções de posições `x/y`, IDs duplicados e compatibilidade com bindings nativos antigos.
