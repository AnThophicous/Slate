# Changelog

## [2.1.0] - 2026-08-30

Slate 2.1.0 is scheduled for release today. This release adds the React
terminal reconciler, high-level terminal APIs, reusable classes, stable node
and event identities, richer components, and improved Unicode grapheme support.

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
