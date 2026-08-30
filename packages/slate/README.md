# @slate-terminal/core

Facade TypeScript da Slate. A API é agnóstica à origem dos eventos: teclado, mouse,
stdin customizado ou um adaptador próprio podem produzir os mesmos tipos de evento.

Quando o binding nativo estiver instalado, `render` e `renderText` usam Rust. Um
fallback ANSI pequeno mantém a API útil durante desenvolvimento sem o addon.
