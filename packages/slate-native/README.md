# @slate-terminal/native

Binding N-API da Slate para Node.js 18+, compilado em Rust. O pacote expõe
eventos de teclado e mouse, resize, paste, mudanças de foco e controles de ciclo
de vida do terminal. Ele não é necessário para renderizar um frame ANSI; é a
dependência do caminho de entrada física. React é independente deste pacote e
continua opcional no runtime Slate.

## Plataformas e artefatos

O pacote declara suporte a estes alvos Node:

- Windows x64 e arm64, usando MSVC
- Linux x64 e arm64, usando glibc
- macOS x64 e arm64

O release precisa conter o arquivo específico do alvo, como `slate_node.win32-x64-msvc.node`. O loader não aceita uma arquitetura diferente silenciosamente.

Em um checkout do Slate, gere o artefato a partir da raiz do repositório:

```sh
npm run native:build
```

O loader procura, nesta ordem, o artefato publicado do alvo, `slate_node.node` para um build local sem `--platform` e o artefato convencional em `target/release`. Um candidato ausente permite o próximo fallback. Um arquivo existente que falha no `require` ou no `dlopen` interrompe a resolução e preserva a causa do erro; não há fallback silencioso para um binário quebrado.

Sem um `.node` publicado ou um build local, `require("@slate-terminal/native")` falha com `ERR_SLATE_NATIVE_BINARY_NOT_FOUND`, incluindo o alvo e os caminhos verificados. Isso é intencional: este pacote não fornece uma implementação JavaScript falsa para operações de terminal.

## Fechamento do terminal

`closeTerminal()` tenta restaurar cursor, alternate screen, raw mode e todas as capturas de mouse, paste e foco. A implementação nativa tenta cada modo e retorna o primeiro erro de I/O depois das tentativas. Chame-a em um `finally` ou no caminho de encerramento da aplicação:

```js
const native = require("@slate-terminal/native")

try {
  native.enableRawMode()
  // loop da aplicação
} finally {
  native.closeTerminal()
}
```

O pacote valida os exports essenciais, incluindo `closeTerminal`, no carregamento. Um addon incompatível falha com `ERR_SLATE_NATIVE_CONTRACT` em vez de ser tratado como um fallback válido.
