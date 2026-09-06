/**
 * Low-level console access.
 *
 * Everything above this module works with a component tree. This module is the
 * escape hatch under it: raw sequences, terminal modes, cursor, buffers and
 * input, with the same lifecycle guarantees Slate applies to its own session.
 * It is intentionally usable on its own, so a program can drive the console
 * directly and still get an idempotent teardown that restores every mode it
 * turned on, in reverse order, including on a crash.
 */

import { detectTerminalCapabilities, type TerminalCapabilities } from "./capabilities.js";
import type { Viewport } from "./flex.js";

export type CursorShape = "block" | "bar" | "underline";
export type ClearMode = "all" | "before" | "after";

export interface ConsoleOutputStream {
  write(chunk: string): unknown;
  readonly columns?: number;
  readonly rows?: number;
  readonly isTTY?: boolean;
  on?(event: string, listener: (...args: never[]) => void): unknown;
  off?(event: string, listener: (...args: never[]) => void): unknown;
  removeListener?(event: string, listener: (...args: never[]) => void): unknown;
}

export interface ConsoleInputStream {
  setRawMode?(mode: boolean): unknown;
  setEncoding?(encoding: string): unknown;
  resume?(): unknown;
  pause?(): unknown;
  readonly isTTY?: boolean;
  on?(event: string, listener: (...args: never[]) => void): unknown;
  off?(event: string, listener: (...args: never[]) => void): unknown;
  removeListener?(event: string, listener: (...args: never[]) => void): unknown;
}

export interface ConsoleOptions {
  readonly output?: ConsoleOutputStream;
  readonly input?: ConsoleInputStream;
  readonly capabilities?: Partial<TerminalCapabilities>;
  /** Fallback size when the stream reports none (a pipe, a test double). */
  readonly viewport?: Viewport;
  /** Restore the console when the process exits. Defaults to true. */
  readonly restoreOnExit?: boolean;
}

export interface ConsoleHandle {
  readonly stream: ConsoleOutputStream;
  readonly capabilities: TerminalCapabilities;
  readonly isOpen: () => boolean;
  /** Writes text verbatim. Nothing is escaped, measured or buffered. */
  readonly write: (chunk: string) => void;
  /** Writes CSI sequences: `csi("2J")` emits `ESC [ 2 J`. */
  readonly csi: (...sequences: readonly string[]) => void;
  readonly cursorTo: (x: number, y: number) => void;
  readonly cursorMove: (dx: number, dy: number) => void;
  readonly hideCursor: () => void;
  readonly showCursor: () => void;
  readonly saveCursor: () => void;
  readonly restoreCursor: () => void;
  readonly cursorShape: (shape: CursorShape, blinking?: boolean) => void;
  readonly clear: (mode?: ClearMode) => void;
  readonly clearLine: (mode?: ClearMode) => void;
  readonly scrollRegion: (top: number, bottom: number) => void;
  readonly resetScrollRegion: () => void;
  readonly alternateScreen: (enabled: boolean) => void;
  readonly rawMode: (enabled: boolean) => boolean;
  readonly mouse: (enabled: boolean) => void;
  readonly bracketedPaste: (enabled: boolean) => void;
  readonly focusReports: (enabled: boolean) => void;
  readonly title: (value: string) => void;
  readonly bell: () => void;
  readonly reset: () => void;
  readonly size: () => Viewport;
  readonly onResize: (listener: (viewport: Viewport) => void) => () => void;
  /** Raw input chunks, with raw mode left to the caller. */
  readonly onData: (listener: (chunk: string) => void) => () => void;
  /** Restores every mode this handle enabled, in reverse order. Idempotent. */
  readonly close: () => void;
}

/** Pure sequence builders. Nothing here touches a stream. */
export const ANSI = {
  csi: (value: string): string => `\u001b[${value}`,
  cursorTo: (x: number, y: number): string => `\u001b[${Math.max(1, Math.floor(y) + 1)};${Math.max(1, Math.floor(x) + 1)}H`,
  cursorUp: (rows: number): string => (rows > 0 ? `\u001b[${Math.floor(rows)}A` : ""),
  cursorDown: (rows: number): string => (rows > 0 ? `\u001b[${Math.floor(rows)}B` : ""),
  cursorForward: (columns: number): string => (columns > 0 ? `\u001b[${Math.floor(columns)}C` : ""),
  cursorBack: (columns: number): string => (columns > 0 ? `\u001b[${Math.floor(columns)}D` : ""),
  hideCursor: "\u001b[?25l",
  showCursor: "\u001b[?25h",
  saveCursor: "\u001b7",
  restoreCursor: "\u001b8",
  cursorShape: (shape: CursorShape, blinking = true): string => `\u001b[${cursorShapeCode(shape, blinking)} q`,
  clear: (mode: ClearMode = "all"): string => `\u001b[${clearCode(mode)}J`,
  clearLine: (mode: ClearMode = "all"): string => `\u001b[${clearCode(mode)}K`,
  scrollRegion: (top: number, bottom: number): string => `\u001b[${Math.max(1, Math.floor(top) + 1)};${Math.max(1, Math.floor(bottom) + 1)}r`,
  resetScrollRegion: "\u001b[r",
  alternateScreen: (enabled: boolean): string => (enabled ? "\u001b[?1049h" : "\u001b[?1049l"),
  mouse: (enabled: boolean): string => (enabled ? "\u001b[?1000h\u001b[?1002h\u001b[?1015h\u001b[?1006h" : "\u001b[?1006l\u001b[?1015l\u001b[?1002l\u001b[?1000l"),
  bracketedPaste: (enabled: boolean): string => (enabled ? "\u001b[?2004h" : "\u001b[?2004l"),
  focusReports: (enabled: boolean): string => (enabled ? "\u001b[?1004h" : "\u001b[?1004l"),
  title: (value: string): string => `\u001b]0;${value.replace(/[\u0000-\u001f\u007f]/gu, "")}\u0007`,
  bell: "\u0007",
  reset: "\u001b[0m"
} as const;

const DEFAULT_VIEWPORT: Viewport = { width: 80, height: 24 };

export function openConsole(options: ConsoleOptions = {}): ConsoleHandle {
  const output = options.output ?? processStdout();
  const input = options.input ?? processStdin();
  const capabilities = detectTerminalCapabilities({ stream: output, overrides: options.capabilities });
  const fallback = options.viewport ?? DEFAULT_VIEWPORT;
  // Restores run in reverse order, so a teardown undoes the modes exactly the
  // way they were layered on.
  const restores: (() => void)[] = [];
  const subscriptions: (() => void)[] = [];
  let open = true;
  let rawEnabled = false;

  const write = (chunk: string): void => {
    if (!open || chunk.length === 0) return;
    try {
      output.write(chunk);
    } catch {
      // A closed pipe is the caller's problem to observe, not a reason to throw
      // from a teardown path.
    }
  };

  const toggle = (enabled: boolean, sequence: (state: boolean) => string, restore: () => void): void => {
    write(sequence(enabled));
    if (enabled) restores.push(restore);
  };

  const close = (): void => {
    if (!open) return;
    for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
    while (restores.length > 0) restores.pop()?.();
    open = false;
    detachExit();
  };

  const detachExit = options.restoreOnExit === false ? () => undefined : registerExitCleanup(() => close());

  return {
    stream: output,
    capabilities,
    isOpen: () => open,
    write,
    csi: (...sequences) => write(sequences.map(value => ANSI.csi(value)).join("")),
    cursorTo: (x, y) => write(ANSI.cursorTo(x, y)),
    cursorMove: (dx, dy) => write(`${dx > 0 ? ANSI.cursorForward(dx) : ANSI.cursorBack(-dx)}${dy > 0 ? ANSI.cursorDown(dy) : ANSI.cursorUp(-dy)}`),
    hideCursor: () => {
      write(ANSI.hideCursor);
      restores.push(() => write(ANSI.showCursor));
    },
    showCursor: () => write(ANSI.showCursor),
    saveCursor: () => write(ANSI.saveCursor),
    restoreCursor: () => write(ANSI.restoreCursor),
    cursorShape: (shape, blinking) => {
      if (!capabilities.cursorShape) return;
      write(ANSI.cursorShape(shape, blinking));
      restores.push(() => write(ANSI.cursorShape("block", true)));
    },
    clear: mode => write(ANSI.clear(mode)),
    clearLine: mode => write(ANSI.clearLine(mode)),
    scrollRegion: (top, bottom) => {
      write(ANSI.scrollRegion(top, bottom));
      restores.push(() => write(ANSI.resetScrollRegion));
    },
    resetScrollRegion: () => write(ANSI.resetScrollRegion),
    alternateScreen: enabled => toggle(enabled, ANSI.alternateScreen, () => write(ANSI.alternateScreen(false))),
    rawMode: enabled => {
      if (typeof input?.setRawMode !== "function") return false;
      try {
        input.setRawMode(enabled);
      } catch {
        return false;
      }
      if (enabled && !rawEnabled) {
        rawEnabled = true;
        restores.push(() => {
          rawEnabled = false;
          try {
            input.setRawMode?.(false);
          } catch {
            // The stream may already be destroyed during exit.
          }
        });
      }
      return true;
    },
    mouse: enabled => toggle(enabled, ANSI.mouse, () => write(ANSI.mouse(false))),
    bracketedPaste: enabled => toggle(enabled, ANSI.bracketedPaste, () => write(ANSI.bracketedPaste(false))),
    focusReports: enabled => toggle(enabled, ANSI.focusReports, () => write(ANSI.focusReports(false))),
    title: value => write(ANSI.title(value)),
    bell: () => write(ANSI.bell),
    reset: () => write(ANSI.reset),
    size: () => readSize(output, fallback),
    onResize: listener => {
      const handler = (): void => listener(readSize(output, fallback));
      const unsubscribe = subscribe(output, "resize", handler);
      subscriptions.push(unsubscribe);
      return unsubscribe;
    },
    onData: listener => {
      const handler = (chunk: unknown): void => listener(typeof chunk === "string" ? chunk : String(chunk));
      const unsubscribe = subscribe(input, "data", handler as (...args: never[]) => void);
      subscriptions.push(unsubscribe);
      return unsubscribe;
    },
    close
  };
}

/**
 * Opens a console with the interactive modes Slate itself uses. Returns the
 * same handle, so the caller keeps full low-level access to the session.
 */
export function openInteractiveConsole(options: ConsoleOptions & {
  readonly alternateScreen?: boolean;
  readonly mouse?: boolean;
  readonly paste?: boolean;
  readonly focusReports?: boolean;
  readonly hideCursor?: boolean;
  readonly raw?: boolean;
} = {}): ConsoleHandle {
  const handle = openConsole(options);
  const capabilities = handle.capabilities;
  try {
    if (options.raw !== false) handle.rawMode(true);
    if (options.alternateScreen !== false && capabilities.alternateScreen) handle.alternateScreen(true);
    if (options.mouse !== false && capabilities.mouse) handle.mouse(true);
    if (options.paste !== false && capabilities.bracketedPaste) handle.bracketedPaste(true);
    if (options.focusReports !== false && capabilities.focusReports) handle.focusReports(true);
    if (options.hideCursor !== false) handle.hideCursor();
  } catch (error) {
    // A half-enabled session is worse than none: undo whatever was applied.
    handle.close();
    throw error;
  }
  return handle;
}

function readSize(stream: ConsoleOutputStream | undefined, fallback: Viewport): Viewport {
  const width = positive(stream?.columns) ?? positive(Number(processEnv().COLUMNS)) ?? fallback.width;
  const height = positive(stream?.rows) ?? positive(Number(processEnv().LINES)) ?? fallback.height;
  return { width, height };
}

function positive(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function subscribe(target: { on?: (event: string, listener: (...args: never[]) => void) => unknown; off?: (event: string, listener: (...args: never[]) => void) => unknown; removeListener?: (event: string, listener: (...args: never[]) => void) => unknown } | undefined, event: string, listener: (...args: never[]) => void): () => void {
  if (typeof target?.on !== "function") return () => undefined;
  target.on(event, listener);
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    const remove = target.off ?? target.removeListener;
    remove?.call(target, event, listener);
  };
}

function cursorShapeCode(shape: CursorShape, blinking: boolean): number {
  if (shape === "bar") return blinking ? 5 : 6;
  if (shape === "underline") return blinking ? 3 : 4;
  return blinking ? 1 : 2;
}

function clearCode(mode: ClearMode): number {
  if (mode === "before") return 1;
  if (mode === "after") return 0;
  return 2;
}

type ExitHost = {
  once?: (event: string, listener: () => void) => unknown;
  off?: (event: string, listener: () => void) => unknown;
  removeListener?: (event: string, listener: () => void) => unknown;
};

function registerExitCleanup(cleanup: () => void): () => void {
  const host = (globalThis as typeof globalThis & { process?: ExitHost }).process;
  if (!host?.once) return () => undefined;
  host.once("exit", cleanup);
  return () => {
    const remove = host.off ?? host.removeListener;
    remove?.call(host, "exit", cleanup);
  };
}

function processStdout(): ConsoleOutputStream {
  return (globalThis as typeof globalThis & { process?: { stdout?: ConsoleOutputStream } }).process?.stdout ?? { write: () => true };
}

function processStdin(): ConsoleInputStream | undefined {
  return (globalThis as typeof globalThis & { process?: { stdin?: ConsoleInputStream } }).process?.stdin;
}

function processEnv(): Readonly<Record<string, string | undefined>> {
  return (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}
