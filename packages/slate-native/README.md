# @slate-terminal/native

Binding N-API oficial da Slate 2.0.0, compilado em Rust para Node.js. O addon expõe renderização ANSI, eventos de teclado e mouse, resize, paste, mudanças de foco e os controles de ciclo de vida do terminal.

O loader seleciona o artefato da plataforma atual em Linux, Windows e macOS. A compilação local usa `npm run native:build`; releases geram os arquivos `.node` em uma matriz dos três sistemas.
