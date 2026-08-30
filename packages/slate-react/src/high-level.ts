import { createReactTerminalRoot, type ReactTerminalRoot } from "./react-renderer.js";
import { createTerminalController, type SlateApplication, type SlateInputSource, type SlateOutput, type SlateAppOptions, type TerminalControllerOptions, type SlateTerminalController } from "./runtime.js";
import type { SlateChild } from "./types.js";
export { createNormalizedInput, normalizeEvent } from "./input.js";
export { createScrollback, type ScrollbackBuffer } from "./scrollback.js";

export interface TerminalOptions extends TerminalControllerOptions {
  readonly input: SlateInputSource;
  readonly output: SlateOutput;
}

export interface ReactTerminalSession extends ReactTerminalRoot {
  readonly terminal?: SlateTerminalController;
}

/** High-level terminal lifecycle facade for React and native Slate apps. */
export function createTerminal<S>(app: SlateApplication<S>, options: TerminalOptions): SlateTerminalController {
  return createTerminalController(app, options.input, options.output, options);
}

/** Mounts a real React element and optionally wires terminal input/output. */
export async function renderReact(element: unknown, options: SlateAppOptions & Partial<TerminalOptions> = {}): Promise<ReactTerminalSession> {
  const root = await createReactTerminalRoot(options);
  // Let React commit before the terminal controller writes its first frame.
  // Starting the controller first used to expose the reconciler's transient
  // empty container as a visible blank screen.
  root.render(element);
  await Promise.resolve();
  if (options.input && options.output) {
    const terminal = createTerminal(root.app, options as TerminalOptions);
    terminal.start();
    return {
      ...root,
      terminal,
      close: () => {
        terminal.close();
        root.close();
      }
    };
  }
  return root;
}

export interface SlateTheme {
  readonly colors: Readonly<Record<string, string>>;
  readonly spacing: Readonly<Record<string, number>>;
  readonly radius?: Readonly<Record<string, number>>;
}

export function createTheme(theme: Partial<SlateTheme> = {}): SlateTheme {
  return {
    colors: { primary: "#38bdf8", success: "#4ade80", warning: "#facc15", danger: "#fb7185", muted: "#64748b", background: "#0f172a", foreground: "#f8fafc", ...theme.colors },
    spacing: { xs: 0, sm: 1, md: 2, lg: 3, xl: 4, ...theme.spacing },
    radius: theme.radius
  };
}

export type EventMatcher = (event: import("./types.js").SlateEvent) => boolean;
export function onKey(code: string, handler: import("./types.js").EventHandler): import("./types.js").EventHandler {
  return (event, node) => event.kind === "key" && event.code === code ? handler(event, node) : "ignored";
}
export function onEvent(matcher: EventMatcher, handler: import("./types.js").EventHandler): import("./types.js").EventHandler {
  return (event, node) => matcher(event) ? handler(event, node) : "ignored";
}

export function fragment(...children: SlateChild[]): SlateChild[] { return children; }
