/**
 * Terminal capability detection.
 *
 * Slate targets Linux, macOS and Windows with one code path, so the places
 * where terminals genuinely differ are resolved here instead of being guessed
 * at every call site. Detection is a pure function of the environment: pass an
 * `env` and a `platform` and the answer is reproducible, which is what makes
 * the matrix testable on a machine that does not have the terminal installed.
 */

export type ColorDepth = "none" | "basic" | "256" | "truecolor";
export type ImageProtocol = "kitty" | "iterm2" | "none";

export interface TerminalCapabilities {
  readonly platform: string;
  /** Terminal family resolved from the environment, or `"unknown"`. */
  readonly terminal: string;
  readonly tty: boolean;
  readonly colors: ColorDepth;
  /** Non-ASCII box drawing and symbols are safe to emit. */
  readonly unicode: boolean;
  /** Double-width glyphs occupy two cells, as Slate measures them. */
  readonly wideGlyphs: boolean;
  readonly mouse: boolean;
  readonly bracketedPaste: boolean;
  readonly focusReports: boolean;
  readonly alternateScreen: boolean;
  readonly hyperlinks: boolean;
  readonly images: ImageProtocol;
  readonly cursorShape: boolean;
  /** Windows only: VT sequences are processed by the console host. */
  readonly virtualTerminal: boolean;
}

export interface DetectCapabilitiesOptions {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly platform?: string;
  readonly isTty?: boolean;
  readonly stream?: { readonly isTTY?: boolean };
  readonly overrides?: Partial<TerminalCapabilities>;
}

export function detectTerminalCapabilities(options: DetectCapabilitiesOptions = {}): TerminalCapabilities {
  const env = options.env ?? processEnv();
  const platform = options.platform ?? processPlatform();
  const tty = options.isTty ?? options.stream?.isTTY ?? processIsTty();
  const terminal = terminalName(env, platform);
  const dumb = env.TERM === "dumb";
  const windowsLegacy = platform === "win32" && terminal === "conhost";
  const base: TerminalCapabilities = {
    platform,
    terminal,
    tty,
    colors: colorDepth(env, platform, terminal, tty),
    unicode: supportsUnicode(env, platform, terminal),
    wideGlyphs: supportsUnicode(env, platform, terminal) && !windowsLegacy,
    mouse: tty && !dumb,
    bracketedPaste: tty && !dumb && !windowsLegacy,
    focusReports: tty && !dumb && !windowsLegacy,
    alternateScreen: tty && !dumb,
    hyperlinks: hyperlinkSupport(terminal),
    images: imageProtocol(env, terminal),
    cursorShape: !dumb && terminal !== "conhost",
    virtualTerminal: platform !== "win32" || terminal !== "conhost" || env.ANSICON !== undefined
  };
  return options.overrides ? mergeCapabilities(base, options.overrides) : base;
}

export function mergeCapabilities(base: TerminalCapabilities, overrides: Partial<TerminalCapabilities>): TerminalCapabilities {
  return { ...base, ...stripUndefined(overrides) };
}

export interface TerminalProfile {
  readonly terminal: string;
  readonly platforms: readonly string[];
  readonly colors: ColorDepth;
  readonly unicode: boolean;
  readonly mouse: boolean;
  readonly images: ImageProtocol;
  readonly notes: string;
}

/**
 * The support matrix Slate commits to. Each row is what the runtime assumes
 * when it recognizes the terminal, and the value it degrades to otherwise.
 */
export function capabilityMatrix(): readonly TerminalProfile[] {
  return [
    { terminal: "windows-terminal", platforms: ["win32"], colors: "truecolor", unicode: true, mouse: true, images: "none", notes: "Windows Terminal processa VT por padrão." },
    { terminal: "conhost", platforms: ["win32"], colors: "256", unicode: false, mouse: true, images: "none", notes: "CMD/PowerShell no console legado: bordas ASCII e sem glifo largo." },
    { terminal: "vscode", platforms: ["win32", "darwin", "linux"], colors: "truecolor", unicode: true, mouse: true, images: "none", notes: "Terminal integrado do VS Code." },
    { terminal: "iterm2", platforms: ["darwin"], colors: "truecolor", unicode: true, mouse: true, images: "iterm2", notes: "Protocolo de imagem inline nativo." },
    { terminal: "apple-terminal", platforms: ["darwin"], colors: "256", unicode: true, mouse: true, images: "none", notes: "Terminal.app não anuncia truecolor." },
    { terminal: "kitty", platforms: ["darwin", "linux"], colors: "truecolor", unicode: true, mouse: true, images: "kitty", notes: "Protocolo gráfico do kitty." },
    { terminal: "wezterm", platforms: ["win32", "darwin", "linux"], colors: "truecolor", unicode: true, mouse: true, images: "iterm2", notes: "Aceita o protocolo do iTerm2." },
    { terminal: "alacritty", platforms: ["win32", "darwin", "linux"], colors: "truecolor", unicode: true, mouse: true, images: "none", notes: "Sem protocolo de imagem." },
    { terminal: "xterm", platforms: ["linux", "darwin"], colors: "256", unicode: true, mouse: true, images: "none", notes: "Base conservadora para TERM=xterm*." },
    { terminal: "unknown", platforms: ["win32", "darwin", "linux"], colors: "basic", unicode: false, mouse: false, images: "none", notes: "Sem detecção: Slate degrada para o mínimo seguro." }
  ];
}

export function describeCapabilities(capabilities: TerminalCapabilities): string {
  return [
    `${capabilities.terminal}@${capabilities.platform}`,
    `cores=${capabilities.colors}`,
    `unicode=${capabilities.unicode ? "sim" : "não"}`,
    `mouse=${capabilities.mouse ? "sim" : "não"}`,
    `imagem=${capabilities.images}`,
    `tty=${capabilities.tty ? "sim" : "não"}`
  ].join(" ");
}

/** Builds the SGR parameters for one color at the given depth. */
export function colorParameters(hex: string, depth: ColorDepth, layer: "foreground" | "background"): string | undefined {
  if (depth === "none") return undefined;
  const channels = rgbChannels(hex);
  if (!channels) return undefined;
  if (depth === "truecolor") return `${layer === "foreground" ? 38 : 48};2;${channels.join(";")}`;
  if (depth === "256") return `${layer === "foreground" ? 38 : 48};5;${ansi256Index(channels)}`;
  const [code, bright] = ansiBasicIndex(channels);
  const base = layer === "foreground" ? 30 : 40;
  return String(base + code + (bright ? 60 : 0));
}

/** Maps a color to the xterm 256 palette, using the grayscale ramp when it fits. */
export function ansi256Index(channels: readonly [number, number, number]): number {
  const [red, green, blue] = channels;
  if (Math.abs(red - green) < 8 && Math.abs(green - blue) < 8) {
    if (red < 8) return 16;
    if (red > 248) return 231;
    return 232 + Math.round(((red - 8) / 247) * 24);
  }
  return 16 + 36 * cubeChannel(red) + 6 * cubeChannel(green) + cubeChannel(blue);
}

/** Maps a color to the 8 base colors plus the bright flag. */
export function ansiBasicIndex(channels: readonly [number, number, number]): readonly [number, boolean] {
  const [red, green, blue] = channels;
  const bright = Math.max(red, green, blue) > 170;
  const threshold = bright ? 128 : 96;
  const code = (red >= threshold ? 1 : 0) | ((green >= threshold ? 1 : 0) << 1) | ((blue >= threshold ? 1 : 0) << 2);
  return [code, bright && code !== 0];
}

export function rgbChannels(hex: string): readonly [number, number, number] | undefined {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return undefined;
  return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)];
}

function cubeChannel(value: number): number {
  return Math.round(Math.max(0, Math.min(255, value)) / 51);
}

function terminalName(env: Readonly<Record<string, string | undefined>>, platform: string): string {
  const term = env.TERM ?? "";
  const program = env.TERM_PROGRAM ?? "";
  if (env.KITTY_WINDOW_ID || term === "xterm-kitty") return "kitty";
  if (program === "iTerm.app") return "iterm2";
  if (program === "Apple_Terminal") return "apple-terminal";
  if (program === "vscode") return "vscode";
  if (env.WEZTERM_EXECUTABLE || program === "WezTerm") return "wezterm";
  if (env.ALACRITTY_WINDOW_ID || term === "alacritty") return "alacritty";
  if (env.WT_SESSION) return "windows-terminal";
  if (env.ConEmuANSI) return "conemu";
  if (platform === "win32") return "conhost";
  if (term.startsWith("xterm")) return "xterm";
  if (term.startsWith("screen") || term.startsWith("tmux")) return "tmux";
  if (term.length > 0 && term !== "dumb") return term;
  return "unknown";
}

function colorDepth(env: Readonly<Record<string, string | undefined>>, platform: string, terminal: string, tty: boolean): ColorDepth {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return "none";
  const forced = env.FORCE_COLOR;
  if (forced !== undefined) {
    if (/^(0|false|none)$/i.test(forced)) return "none";
    if (forced === "1" || /^(true|basic)$/i.test(forced)) return "basic";
    if (forced === "2" || forced === "256") return "256";
    return "truecolor";
  }
  if (env.TERM === "dumb") return "none";
  if (!tty) return "none";
  const colorTerm = env.COLORTERM ?? "";
  if (/truecolor|24bit/i.test(colorTerm)) return "truecolor";
  if (terminal === "windows-terminal" || terminal === "vscode" || terminal === "kitty" || terminal === "wezterm" || terminal === "alacritty" || terminal === "iterm2") return "truecolor";
  if ((env.TERM ?? "").includes("256")) return "256";
  if (platform === "win32") return "256";
  if (terminal === "unknown") return "basic";
  return "256";
}

function supportsUnicode(env: Readonly<Record<string, string | undefined>>, platform: string, terminal: string): boolean {
  if (env.SLATE_ASCII !== undefined && env.SLATE_ASCII !== "0") return false;
  if (env.TERM === "dumb") return false;
  if (platform === "win32") {
    // The legacy console host renders box drawing only under a UTF-8 code page,
    // which Slate cannot assume. Windows Terminal and VS Code always can.
    return terminal !== "conhost" || /utf-?8/i.test(env.SLATE_ENCODING ?? env.PYTHONIOENCODING ?? "");
  }
  const locale = `${env.LC_ALL ?? ""}${env.LC_CTYPE ?? ""}${env.LANG ?? ""}`;
  return locale.length === 0 || /utf-?8/i.test(locale);
}

function hyperlinkSupport(terminal: string): boolean {
  return terminal === "iterm2" || terminal === "kitty" || terminal === "wezterm" || terminal === "vscode" || terminal === "windows-terminal";
}

function imageProtocol(env: Readonly<Record<string, string | undefined>>, terminal: string): ImageProtocol {
  if (env.SLATE_IMAGE_PROTOCOL === "kitty" || env.SLATE_IMAGE_PROTOCOL === "iterm2") return env.SLATE_IMAGE_PROTOCOL;
  if (env.SLATE_IMAGE_PROTOCOL === "none") return "none";
  if (terminal === "kitty") return "kitty";
  if (terminal === "iterm2" || terminal === "wezterm") return "iterm2";
  return "none";
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

function processEnv(): Readonly<Record<string, string | undefined>> {
  return (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

function processPlatform(): string {
  return (globalThis as typeof globalThis & { process?: { platform?: string } }).process?.platform ?? "linux";
}

function processIsTty(): boolean {
  return (globalThis as typeof globalThis & { process?: { stdout?: { isTTY?: boolean } } }).process?.stdout?.isTTY === true;
}
