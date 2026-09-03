# Changelog

## [Unreleased]

## [2.2.2] - 2026-09-03

### Fixed

- Corrigida a asserção do teste Rust de sanitização OSC para verificar apenas
  o texto escrito, sem confundir células de preenchimento do frame com saída.

## [2.2.1] - 2026-09-03

This patch release ships the interactive terminal and media hardening merged
after 2.2.0. It keeps the public API additive and includes the same
cross-platform native package version for the Windows, Linux and macOS release
matrix.

### Included

- Safer terminal lifecycle with rollback, idempotent close and cleanup on
  input, render and output failures.
- Deterministic render-pass limits and pointer capture for reliable interactive
  mouse and keyboard behavior.
- ANSI/control-sequence sanitization, absolute row anchoring and real border
  styles to prevent corrupted or drifting terminal output.
- Typed `Image`, `Video` and `Media` support with Kitty/iTerm2/alt-text
  fallbacks.

### Added

- `Image`, `Video` e `Media` com sources tipados, `loadMediaFile()` e saída opcional para Kitty/iTerm2; sem suporte visual, o `alt` segue no grid.
- `createTerminalSession()` para ativar capacidades interativas com rollback e um único caminho de encerramento.
- Captura de ponteiro para `press`/`drag`/`release`, tamanho inicial opcional da fonte e um exemplo Node mais completo.
- Bordas reais (`single`, `double`, `rounded`, `heavy`) no renderer TSX.
- Âncora absoluta das linhas ANSI para impedir deslocamento horizontal entre terminais.

### Fixed

- Falhas de input, render e output agora fecham polling, desmontam o app e tentam restaurar o terminal; `onError` e `error()` expõem o diagnóstico.
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
