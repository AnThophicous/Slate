# @slate-terminal/native

Binding N-API oficial da Slate 2.2.2, compilado em Rust para Node.js. O addon expõe renderização ANSI, eventos de teclado e mouse, resize, paste, mudanças de foco e os controles de ciclo de vida do terminal.

O loader seleciona o artefato da plataforma atual em Linux, Windows e macOS. A compilação local usa `npm run native:build`; releases geram os arquivos `.node` em uma matriz dos três sistemas.

`closeTerminal()` é o helper de emergência para restaurar cursor, raw mode,
mouse capture, paste/focus capture e alternate screen. O caminho normal de uma
aplicação Node é conectar `createInputSource()` a
`createTerminalController()` e chamar `controller.close()` no encerramento.
