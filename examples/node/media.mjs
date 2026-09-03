import { Container, Image, Panel, Text, Video, createTerminalController, render } from "@slate-terminal/react";
import { createTerminalSession } from "@slate-terminal/core";
import { loadMediaFile } from "@slate-terminal/react";

const files = process.argv.slice(2);
if (files.length === 0) {
  process.stderr.write("Uso: node examples/node/media.mjs capa.png frame-02.png frame-03.png\n");
  process.exitCode = 1;
} else {
  const frames = files.map(file => loadMediaFile(file));
  const app = render(Container({
    id: "media-demo",
    direction: "column",
    gap: 1,
    padding: 1,
    children: [
      Text({ text: "SLATE / MEDIA PREVIEW", textStyle: { bold: true }, foreground: "#7dd3fc" }),
      Panel({ title: "IMAGE", border: { style: "rounded", color: "#38bdf8" }, children: Image({ id: "image", source: frames[0], width: 36, height: 12, protocol: "auto", alt: "imagem indisponível neste terminal" }) }),
      Panel({ title: "FRAME SEQUENCE", border: { style: "single", color: "#334155" }, children: Video({ id: "video", source: frames[0], frames, width: 36, height: 12, protocol: "auto", alt: "frames indisponíveis neste terminal" }) })
    ]
  }), { viewport: { width: 80, height: 30 }, frameRate: 30 });
  const session = createTerminalSession();
  const terminal = createTerminalController(app, session.input, { write: value => process.stdout.write(value) }, { onError: error => process.stderr.write(`Slate: ${String(error)}\n`) });
  const close = () => { terminal.close(); session.close(); };
  process.once("SIGINT", close);
  terminal.start();
}
