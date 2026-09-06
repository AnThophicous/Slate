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

// The theme moved to its own module when the components started reading it;
// it is re-exported here so existing imports keep working.
export { createTheme, getTheme, peekTheme, resetTheme, setTheme, themeColor, themeSignal, themeSpacing, withTheme, type SlateTheme } from "./theme.js";

export type EventMatcher = (event: import("./types.js").SlateEvent) => boolean;
export function onKey(code: string, handler: import("./types.js").EventHandler): import("./types.js").EventHandler {
  return (event, node) => event.kind === "key" && event.code === code ? handler(event, node) : "ignored";
}
export function onEvent(matcher: EventMatcher, handler: import("./types.js").EventHandler): import("./types.js").EventHandler {
  return (event, node) => matcher(event) ? handler(event, node) : "ignored";
}

export function fragment(...children: SlateChild[]): SlateChild[] { return children; }
