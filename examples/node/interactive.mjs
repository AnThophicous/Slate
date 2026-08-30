import { Button, Container, Input, Text, render, signal } from "@slate-terminal/react";
import { createInputSource, disableAlternateScreen, disableBracketedPaste, disableFocusChange, disableMouseCapture, disableRawMode, enableAlternateScreen, enableBracketedPaste, enableFocusChange, enableMouseCapture, enableRawMode } from "@slate-terminal/core";
import { createTerminalController } from "@slate-terminal/react";

const name = signal("");
const app = render(() => Container({
  id: "app",
  direction: "column",
  gap: 1,
  children: [
    Text({ id: "title", text: "Slate 2.0" }),
    Input({ id: "name", value: name, placeholder: "Nome", onChange: value => name.set(value) }),
    Button({ id: "quit", children: "Sair", onPress: () => "exit" })
  ]
}), { viewport: { width: 80, height: 24 } });

const source = createInputSource();
enableAlternateScreen();
enableRawMode();
enableMouseCapture();
enableBracketedPaste();
enableFocusChange();

let stopped = false;
const stop = () => {
  if (stopped) return;
  stopped = true;
  terminal.stop();
  disableFocusChange();
  disableBracketedPaste();
  disableMouseCapture();
  disableRawMode();
  disableAlternateScreen();
  app.unmount();
};

const terminal = createTerminalController(app, source, { write: value => process.stdout.write(value) }, { onExit: stop });
terminal.start();
process.on("SIGINT", stop);
