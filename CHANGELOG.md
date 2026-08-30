# Changelog

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
