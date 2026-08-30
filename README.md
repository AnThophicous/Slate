# Slate

[![CI](https://github.com/AnThophicous/Slate/actions/workflows/ci.yml/badge.svg)](https://github.com/AnThophicous/Slate/actions/workflows/ci.yml) [![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE) [![Rust](https://img.shields.io/badge/Rust-1.85%2B-orange.svg)](https://www.rust-lang.org/) [![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)

Rust terminal UI toolkit with native Node.js, TypeScript and TSX support.

Slate é uma biblioteca Rust modular para construir interfaces interativas no
terminal, com adaptadores oficiais para teclado, mouse, ANSI e Node.js/TypeScript.
A versão atual é **1.5.0 LTS**.

```rust
use slate_core::{Color, Frame, Point, Size, Style};
use slate_renderer::render_to_ansi;

let mut frame = Frame::new(Size::new(24, 1));
frame.write_text(Point::new(0, 0), "Olá, Slate", Style::default().foreground(Color::Cyan));
print!("{}", render_to_ansi(&frame));
```

```ts
import { renderText } from "@slate-terminal/core";

process.stdout.write(renderText("Olá, Slate", { foreground: "#5eead4" }));
```

## Estrutura

- `slate-core`: geometria, cores, estilos, frames, eventos, containers e contrato `Component`.
- `slate-input`: adaptação crossterm para teclado, mouse, resize e paste.
- `slate-renderer`: saída ANSI incremental para qualquer `Write`.
- `slate-node`: binding N-API nativo em Rust.
- `packages/slate`: facade TypeScript estável e fallback ANSI para desenvolvimento.
- `packages/slate-react`: camada declarativa opcional para JSX, hooks, reconciliação e layout Flexbox/Yoga.

`slate-effects` fornece efeitos opcionais como `Glow` e `ColorShift`, sem
contaminar o contrato base.

## Prática LTS

A API pública segue evolução aditiva: nomes, comportamento e assinaturas estáveis
não são removidos nem reinterpretados durante a linha 1.x. Tipos extensíveis usam
variantes não exaustivas, novos recursos entram por métodos/construtores novos e
depreciações terão documentação e período de migração. O MSRV 1.85 é mantido em 1.x.

```powershell
cargo fmt --all
cargo test --workspace
npm install
npm run typecheck
npm test
```

O binding nativo é compilado com `npm run native:build`. Os releases geram
artefatos `.node` para Linux, Windows e macOS.

## Licença

Apache License 2.0. Consulte [LICENSE](LICENSE).
