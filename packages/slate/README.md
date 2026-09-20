# @slate-terminal/core

API imperativa para Node.js 18+ com renderização ANSI e eventos Slate. O pacote
não exige React. O binding N-API é opcional para o caminho de renderização, mas é
necessário quando a aplicação precisa ler teclado e mouse do terminal físico.

## Um frame

Este programa não abre raw mode nem cria uma sessão viva:

```js
import { Button, Container, createApp, renderText } from "@slate-terminal/core";

const root = Container({
  id: "app",
  children: Button({ id: "save", label: "Salvar" })
});
const app = createApp(root);
app.focus("save");
process.stdout.write(app.render({ clear: false, hideCursor: true }));
process.stdout.write(renderText("Olá, Slate", { foreground: "#5eead4" }));
```

`createApp()` e `render()` produzem uma árvore local. `app.render()` devolve uma
string; a aplicação termina quando o processo termina. Para a API declarativa,
use `@slate-terminal/react` sem instalar React.

## Input físico

`createInputSource()` delega polling e tamanho ao binding nativo. Para a sessão
completa, passe essa fonte a `createTerminalController()` no pacote React e
chame `controller.close()` no encerramento. Instale `@slate-terminal/native`
quando esse caminho for necessário; sem ele, os helpers ANSI continuam usando o
fallback TypeScript.

## Image to ASCII

`rasterToAscii()` e `imageToAscii()` convertem rasters RGB, RGBA ou grayscale
usando luminancia perceptual. `maxWidth`, `aspectRatio`, `charset`, `invert`,
`background` e `color: "ansi24"` sao opcoes explicitas; ANSI fica desligado por
padrao.

```js
import { decodeRaster, imageToAscii } from "@slate-terminal/core";
import { readFileSync } from "node:fs";

const raster = decodeRaster(readFileSync("./portrait.png"));
process.stdout.write(imageToAscii(raster, { maxWidth: 64, aspectRatio: 0.5 }));
```

`decodeRaster()` suporta PGM/PPM e PNG 8-bit nao interlaced (color types 0, 2,
3, 4 e 6). Para ler um caminho, use `loadRasterFile(path, { rootDir })`: o
diretorio-raiz e obrigatorio e a API rejeita URLs, traversal, escapes por
symlink e arquivos maiores que o limite. JPEG, GIF, WebP e TIFF nao sao
decodificados pelo core.

Use `hasNativeBinding()` como preflight antes de abrir uma sessÃ£o fÃ­sica. Quando
ela retornar `false`, `getNativeBindingError()` expÃµe o erro de carregamento em
cache para diagnÃ³stico sem desabilitar o fallback ANSI.

O core exporta `Container`, `Block`, `Text`, `Button`, `Input`, `Select`, `Checkbox`, `Tabs`, `Table`, `Spinner`, `Progress`, `Modal`, `ScrollView`, `List` e `Form`. `SlateApp.update`, `edit`, `setText`, `setPlaceholder`, `setForeground`, `append`, `remove`, `focusNext`, `blur`, `setState` e `dispatch` permitem manter uma aplicação imperativa compatível.

`signal`, `ReadableSignal`, `WritableSignal`, `createInputSource`, `pollEvent`,
raw mode, mouse capture, bracketed paste e focus change completam a integração
com Node.js. Para JSX, use `@slate-terminal/react`, que compartilha os
contratos de eventos e IDs.

`Ctrl+C` é reservado como saída de emergência; `closeTerminal()` restaura
cursor e modos nativos. `createLegacyRendererAdapter()` preserva renderers
textuais antigos durante a migração. Para mouse, prefira o runtime React/core
com hit-test e `event.target`; veja o [guia de produção](../../docs/guide.md).
