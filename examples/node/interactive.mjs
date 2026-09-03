import { Button, Container, Input, Panel, Row, Spinner, Text, createTheme, render, signal } from "@slate-terminal/react";
import { createTerminalSession } from "@slate-terminal/core";
import { createTerminalController } from "@slate-terminal/react";

const name = signal("");
const status = signal("READY / mouse and keyboard online");
const theme = createTheme({
  colors: { primary: "#7dd3fc", success: "#86efac", background: "#08111f", foreground: "#e2e8f0" }
});
const app = render(() => Container({
  id: "app",
  direction: "column",
  gap: 1,
  padding: 1,
  background: theme.colors.background,
  foreground: theme.colors.foreground,
  children: [
    Text({ id: "eyebrow", text: "SLATE / INTERACTIVE WORKBENCH", foreground: theme.colors.primary, textStyle: { bold: true } }),
    Panel({
      id: "hero",
      title: "Terminal-native, sem ruído",
      border: { style: "rounded", color: theme.colors.primary },
      children: [
        Text({ text: "Teclado, mouse, paste, resize e foco no mesmo fluxo." }),
        Text({ text: "Arraste sobre o botão para testar captura de ponteiro.", textStyle: { dim: true } })
      ]
    }),
    Row({
      id: "controls",
      gap: 2,
      children: [
        Panel({ id: "form", title: "IDENTIDADE", border: { style: "single", color: "#334155" }, children: [
          Input({ id: "name", value: name, placeholder: "Digite seu nome", onChange: value => name.set(value) }),
          Button({ id: "save", children: "Salvar", onPress: () => status.set(`SAVED / ${name.peek() || "anonymous"}`) })
        ] }),
        Panel({ id: "telemetry", title: "TELEMETRY", border: { style: "single", color: "#334155" }, children: [
          Spinner({ id: "spinner" }),
          Text({ text: status, foreground: theme.colors.success })
        ] })
      ]
    }),
    Button({ id: "quit", children: "Sair", onPress: () => "exit" })
  ]
}), { viewport: { width: 80, height: 24 }, frameRate: 30 });

const session = createTerminalSession();

const stop = () => {
  terminal.close();
  session.close();
};

const terminal = createTerminalController(app, session.input, { write: value => process.stdout.write(value) }, { onExit: stop });
terminal.start();
process.once("SIGINT", stop);
