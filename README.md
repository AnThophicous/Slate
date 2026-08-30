# Slate

Slate é uma biblioteca Rust modular para construir interfaces interativas no
terminal, com adaptadores oficiais para teclado, mouse, ANSI e Node.js/TypeScript.
A versão atual é **1.0.0 LTS**.

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

- `slate-core`: geometria, cores, estilos, frames, eventos e contrato `Component`.
- `slate-input`: adaptação crossterm para teclado, mouse, resize e paste.
- `slate-renderer`: saída ANSI para qualquer `Write`.
- `slate-node`: binding N-API nativo em Rust.
- `packages/slate`: facade TypeScript estável e fallback ANSI para desenvolvimento.

Efeitos, animações e shaders visuais não fazem parte do núcleo 1.0.0. Serão
adicionados como módulos opcionais, sem contaminar o contrato base.

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

O binding nativo é compilado com `npm run native:build`. O empacotamento de
artefatos `.node` por plataforma será acoplado ao release automatizado.

## Licença

Apache License 2.0. Consulte [LICENSE](LICENSE).
