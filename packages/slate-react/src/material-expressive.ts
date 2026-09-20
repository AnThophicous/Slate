import { batch, readReactive, signal } from "./reactive.js";
import { sanitizeTerminalText } from "./text.js";
import { Button, Container, createElement } from "./vnode.js";
import type {
  BorderSpec,
  ComponentTreeNode,
  EffectSpec,
  ElementId,
  EventHandler,
  EventResult,
  NodeProps,
  SlateChild,
  SlateComponent,
  SlateVNode,
  TextStyle,
  WritableSignal,
  SignalValue
} from "./types.js";

/**
 * M3-inspired roles expressed as terminal-safe tokens.
 *
 * This is deliberately not a claim of web Material 3 fidelity. A terminal
 * has cells, ANSI colors and a small set of border glyphs, so the expressive
 * layer maps the design language onto those primitives instead of pretending
 * it has CSS elevation, density or a browser animation timeline.
 */
export interface MaterialExpressiveColors {
  readonly primary: string;
  readonly onPrimary: string;
  readonly primaryContainer: string;
  readonly onPrimaryContainer: string;
  readonly secondary: string;
  readonly onSecondary: string;
  readonly secondaryContainer: string;
  readonly onSecondaryContainer: string;
  readonly tertiary: string;
  readonly onTertiary: string;
  readonly tertiaryContainer: string;
  readonly onTertiaryContainer: string;
  readonly background: string;
  readonly onBackground: string;
  readonly surface: string;
  readonly surfaceContainer: string;
  readonly surfaceContainerHigh: string;
  readonly surfaceVariant: string;
  readonly onSurface: string;
  readonly onSurfaceVariant: string;
  readonly outline: string;
  readonly outlineVariant: string;
  readonly error: string;
  readonly onError: string;
}

export interface MaterialExpressiveSpacing {
  readonly none: number;
  readonly xs: number;
  readonly sm: number;
  readonly md: number;
  readonly lg: number;
  readonly xl: number;
  readonly xxl: number;
  readonly [token: string]: number;
}

export type MaterialExpressiveShape = "square" | "rounded" | "double" | "heavy";
export type MaterialExpressiveState = "idle" | "hover" | "focus" | "pressed" | "disabled";
export type MaterialExpressiveSurfaceTone =
  | "background"
  | "surface"
  | "surfaceContainer"
  | "surfaceContainerHigh"
  | "surfaceVariant"
  | "primaryContainer"
  | "secondaryContainer"
  | "tertiaryContainer";
export type MaterialExpressiveRole = "primary" | "secondary" | "tertiary";

export type MaterialExpressiveShapes = Readonly<Record<MaterialExpressiveShape, BorderSpec>>;

export interface MaterialExpressiveMotion {
  readonly hover?: EffectSpec;
  readonly focus?: EffectSpec;
  readonly pressed?: EffectSpec;
  readonly disabled?: EffectSpec;
}

export interface MaterialExpressiveTokens {
  readonly colors: MaterialExpressiveColors;
  readonly spacing: MaterialExpressiveSpacing;
  readonly shapes: MaterialExpressiveShapes;
  readonly motion: MaterialExpressiveMotion;
}

export interface MaterialExpressiveOverrides {
  readonly colors?: Partial<MaterialExpressiveColors>;
  readonly spacing?: Readonly<Record<string, number>>;
  readonly shapes?: Partial<Record<MaterialExpressiveShape, BorderSpec>>;
  readonly motion?: Partial<Record<MaterialExpressiveState, EffectSpec | null>>;
}

export interface MaterialExpressiveVisual {
  readonly background?: string;
  readonly foreground?: string;
  readonly border?: boolean | BorderSpec;
  readonly shape?: MaterialExpressiveShape;
  readonly textStyle?: TextStyle;
  readonly effect?: EffectSpec | null;
}

export interface MaterialExpressiveStyleOptions extends MaterialExpressiveVisual {
  readonly tone?: MaterialExpressiveSurfaceTone;
  readonly role?: MaterialExpressiveRole;
}

export interface ExpressiveInteraction {
  readonly hovered: WritableSignal<boolean>;
  readonly focused: WritableSignal<boolean>;
  readonly pressed: WritableSignal<boolean>;
  readonly state: () => Exclude<MaterialExpressiveState, "disabled">;
  readonly reset: () => void;
}

type ExpressiveHandlers = Pick<NodeProps, "onHover" | "onMouse" | "onKey" | "onPress" | "onFocus" | "onBlur">;

export interface MaterialExpressiveNodeProps extends Omit<NodeProps, keyof ExpressiveHandlers | "background" | "foreground" | "border" | "effect">, ExpressiveHandlers {
  readonly background?: string;
  readonly foreground?: string;
  readonly border?: boolean | BorderSpec;
  readonly effect?: SignalValue<EffectSpec | null>;
  readonly tone?: MaterialExpressiveSurfaceTone;
  readonly role?: MaterialExpressiveRole;
  readonly shape?: MaterialExpressiveShape;
  readonly states?: Partial<Record<Exclude<MaterialExpressiveState, "idle">, MaterialExpressiveVisual>>;
  readonly interaction?: ExpressiveInteraction;
}

export type MaterialExpressiveSurfaceProps = MaterialExpressiveNodeProps;
export type MaterialExpressiveButtonProps = MaterialExpressiveNodeProps;

const COLOR_KEYS = Object.keys({
  primary: true,
  onPrimary: true,
  primaryContainer: true,
  onPrimaryContainer: true,
  secondary: true,
  onSecondary: true,
  secondaryContainer: true,
  onSecondaryContainer: true,
  tertiary: true,
  onTertiary: true,
  tertiaryContainer: true,
  onTertiaryContainer: true,
  background: true,
  onBackground: true,
  surface: true,
  surfaceContainer: true,
  surfaceContainerHigh: true,
  surfaceVariant: true,
  onSurface: true,
  onSurfaceVariant: true,
  outline: true,
  outlineVariant: true,
  error: true,
  onError: true
}) as (keyof MaterialExpressiveColors)[];

const SHAPES: readonly MaterialExpressiveShape[] = ["square", "rounded", "double", "heavy"];
const STATES: readonly Exclude<MaterialExpressiveState, "idle">[] = ["hover", "focus", "pressed", "disabled"];

const DEFAULT_COLORS: MaterialExpressiveColors = {
  primary: "#a8c7fa",
  onPrimary: "#0b1d35",
  primaryContainer: "#284777",
  onPrimaryContainer: "#d9e8ff",
  secondary: "#bec6d9",
  onSecondary: "#283141",
  secondaryContainer: "#3e4759",
  onSecondaryContainer: "#dae2f9",
  tertiary: "#dfbbdf",
  onTertiary: "#3e2840",
  tertiaryContainer: "#573e57",
  onTertiaryContainer: "#fad8fa",
  background: "#101318",
  onBackground: "#e4e2e9",
  surface: "#15171c",
  surfaceContainer: "#1c1b20",
  surfaceContainerHigh: "#26252a",
  surfaceVariant: "#45464f",
  onSurface: "#e4e2e9",
  onSurfaceVariant: "#c5c6d0",
  outline: "#8f9099",
  outlineVariant: "#45464f",
  error: "#ffb4ab",
  onError: "#690005"
};

const DEFAULT_SPACING: MaterialExpressiveSpacing = {
  none: 0,
  xs: 1,
  sm: 2,
  md: 3,
  lg: 4,
  xl: 6,
  xxl: 8
};

const DEFAULT_SHAPE_STYLES: Readonly<Record<MaterialExpressiveShape, NonNullable<BorderSpec["style"]>>> = {
  square: "single",
  rounded: "rounded",
  double: "double",
  heavy: "heavy"
};

/** Normalizes a color to the six-digit form accepted by the ANSI renderer. */
export function sanitizeExpressiveColor(value: unknown, fallback = "#000000"): string {
  const safeFallback = normalizeHex(fallback) ?? "#000000";
  if (typeof value !== "string") return safeFallback;
  return normalizeHex(value) ?? safeFallback;
}

/**
 * Removes terminal controls and unstable punctuation from an application id.
 * An omitted or unusable id remains `undefined`, letting Slate derive its
 * deterministic tree-path id without inventing a collision-prone global id.
 */
export function sanitizeExpressiveId(value: unknown): ElementId | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : undefined;
  if (typeof value !== "string") return undefined;
  const clean = sanitizeTerminalText(value)
    .normalize("NFKC")
    .replace(/\s+/gu, "-")
    .replace(/[^\p{L}\p{N}_.:-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^[-.:]+|[-.:]+$/gu, "")
    .slice(0, 96);
  return clean.length > 0 ? clean : undefined;
}

/** Sanitizes a terminal animation contract without introducing a new effect type. */
export function sanitizeExpressiveEffect(value: unknown): EffectSpec | undefined {
  if (!isRecord(value) || (value.kind !== "glow" && value.kind !== "colorShift")) return undefined;
  if (value.kind === "glow") {
    const color = normalizeHex(value.color);
    if (!color) return undefined;
    const result: { kind: "glow"; color: string; radius?: number; intensity?: number; speed?: number } = { kind: "glow", color };
    if (value.radius !== undefined) result.radius = boundedNumber(value.radius, 2, 1, 32);
    if (value.intensity !== undefined) result.intensity = boundedNumber(value.intensity, 0.5, 0, 1);
    if (value.speed !== undefined) result.speed = boundedNumber(value.speed, 1, 0, 16);
    return Object.freeze(result);
  }
  const from = normalizeHex(value.from);
  const to = normalizeHex(value.to);
  if (!from || !to) return undefined;
  const result: { kind: "colorShift"; from: string; to: string; speed?: number } = { kind: "colorShift", from, to };
  if (value.speed !== undefined) result.speed = boundedNumber(value.speed, 1, 0, 16);
  return Object.freeze(result);
}

/** Creates immutable, validated M3-inspired tokens for a terminal surface. */
export function createMaterialExpressiveTokens(overrides: MaterialExpressiveOverrides = {}): MaterialExpressiveTokens {
  const colors = {} as Record<keyof MaterialExpressiveColors, string>;
  for (const key of COLOR_KEYS) {
    colors[key] = sanitizeExpressiveColor(overrides.colors?.[key], DEFAULT_COLORS[key]);
  }

  const spacing: Record<string, number> = { ...DEFAULT_SPACING };
  for (const [key, value] of Object.entries(overrides.spacing ?? {})) {
    if (typeof value === "number" && Number.isFinite(value)) spacing[key] = Math.max(0, Math.min(64, Math.trunc(value)));
  }

  const shapes = {} as Record<MaterialExpressiveShape, BorderSpec>;
  for (const shape of SHAPES) {
    const source = overrides.shapes?.[shape];
    const style = source?.style && DEFAULT_SHAPE_STYLES[shape] !== undefined && isBorderStyle(source.style) ? source.style : DEFAULT_SHAPE_STYLES[shape];
    shapes[shape] = Object.freeze({
      style,
      color: sanitizeExpressiveColor(source?.color, colors.outlineVariant)
    });
  }

  const defaultMotion: Record<Exclude<MaterialExpressiveState, "idle">, EffectSpec | undefined> = {
    hover: { kind: "glow", color: colors.primary, radius: 1, intensity: 0.35, speed: 0.8 },
    focus: { kind: "glow", color: colors.tertiary, radius: 2, intensity: 0.65, speed: 0.6 },
    pressed: { kind: "colorShift", from: colors.primary, to: colors.secondary, speed: 0.8 },
    disabled: undefined
  };
  const motion = {} as MaterialExpressiveMotion;
  for (const state of STATES) {
    const override = overrides.motion?.[state];
    const candidate = override === null ? undefined : override ?? defaultMotion[state];
    const effect = sanitizeExpressiveEffect(candidate);
    if (effect) (motion as Record<string, EffectSpec>)[state] = effect;
  }

  return Object.freeze({
    colors: Object.freeze(colors),
    spacing: Object.freeze(spacing) as MaterialExpressiveSpacing,
    shapes: Object.freeze(shapes),
    motion: Object.freeze(motion)
  });
}

export const MATERIAL_EXPRESSIVE_DEFAULTS = createMaterialExpressiveTokens();

/** Creates a signal-backed interaction state; it owns no timers or listeners. */
export function createExpressiveInteraction(initial: Partial<Pick<ExpressiveInteractionSnapshot, "hovered" | "focused" | "pressed">> = {}): ExpressiveInteraction {
  const hovered = signal(initial.hovered === true);
  const focused = signal(initial.focused === true);
  const pressed = signal(initial.pressed === true);
  return {
    hovered,
    focused,
    pressed,
    state: () => pressed.peek() ? "pressed" : focused.peek() ? "focus" : hovered.peek() ? "hover" : "idle",
    reset: () => batch(() => {
      hovered.set(false);
      focused.set(false);
      pressed.set(false);
    })
  };
}

export interface ExpressiveInteractionSnapshot {
  readonly hovered: boolean;
  readonly focused: boolean;
  readonly pressed: boolean;
}

/** Returns the border token requested by the caller, with an optional safe color override. */
export function expressiveBorder(tokens: MaterialExpressiveTokens, shape: MaterialExpressiveShape = "rounded", color?: string): BorderSpec {
  const base = tokens.shapes[normalizeShape(shape)] ?? tokens.shapes.rounded;
  return Object.freeze({
    style: base.style ?? "single",
    color: sanitizeExpressiveColor(color, base.color ?? tokens.colors.outlineVariant)
  });
}

export function materialExpressiveSurfaceStyle(options: MaterialExpressiveStyleOptions = {}, tokens: MaterialExpressiveTokens = MATERIAL_EXPRESSIVE_DEFAULTS): MaterialExpressiveVisual {
  return baseStyle("surface", options, tokens);
}

export function materialExpressiveButtonStyle(options: MaterialExpressiveStyleOptions = {}, tokens: MaterialExpressiveTokens = MATERIAL_EXPRESSIVE_DEFAULTS): MaterialExpressiveVisual {
  return baseStyle("button", options, tokens);
}

export interface MaterialExpressivePreset {
  readonly tokens: MaterialExpressiveTokens;
  readonly border: (shape?: MaterialExpressiveShape, color?: string) => BorderSpec;
  readonly surfaceStyle: (options?: MaterialExpressiveStyleOptions) => MaterialExpressiveVisual;
  readonly buttonStyle: (options?: MaterialExpressiveStyleOptions) => MaterialExpressiveVisual;
  readonly surface: (props?: MaterialExpressiveSurfaceProps) => SlateVNode;
  readonly button: (props?: MaterialExpressiveButtonProps) => SlateVNode;
}

/** Creates a composable preset without importing React or owning a render loop. */
export function createMaterialExpressivePreset(overrides: MaterialExpressiveOverrides = {}): MaterialExpressivePreset {
  const tokens = createMaterialExpressiveTokens(overrides);
  return Object.freeze({
    tokens,
    border: (shape: MaterialExpressiveShape = "rounded", color?: string) => expressiveBorder(tokens, shape, color),
    surfaceStyle: (options = {}) => materialExpressiveSurfaceStyle(options, tokens),
    buttonStyle: (options = {}) => materialExpressiveButtonStyle(options, tokens),
    surface: (props = {}) => createExpressiveNode("surface", props, tokens),
    button: (props = {}) => createExpressiveNode("button", props, tokens)
  });
}

export const materialExpressive = createMaterialExpressivePreset();

/** Terminal-native expressive surface, also exported from the React package root. */
export function ExpressiveSurface(props: MaterialExpressiveSurfaceProps = {}): SlateVNode {
  return materialExpressive.surface(props);
}

/** Terminal-native expressive button, also exported from the React package root. */
export function ExpressiveButton(props: MaterialExpressiveButtonProps = {}): SlateVNode {
  return materialExpressive.button(props);
}

function createExpressiveNode(kind: "surface" | "button", props: MaterialExpressiveNodeProps, tokens: MaterialExpressiveTokens): SlateVNode {
  const interaction = props.interaction ?? createExpressiveInteraction();
  const {
    tone,
    role,
    shape,
    states,
    interaction: _interaction,
    style,
    background,
    foreground,
    border,
    effect,
    textStyle,
    children,
    id,
    onHover,
    onMouse,
    onKey,
    onPress,
    onFocus,
    onBlur,
    ...rest
  } = props;
  void _interaction;

  const mouseEnabled = kind === "button" || onPress !== undefined || onMouse !== undefined;
  const mouseHandler: EventHandler | undefined = mouseEnabled ? (event, node) => {
    if (event.action === "press") interaction.pressed.set(true);
    else if (event.action === "release") interaction.pressed.set(false);
    const result = onMouse?.(event, node);
    if (result !== undefined && result !== "ignored") return result;
    if (kind === "surface" && event.action === "press" && isPrimaryPress(event) && onPress) {
      return onPress(event, node) ?? "consumed";
    }
    return result;
  } : undefined;
  const keyHandler: EventHandler | undefined = kind === "button" || onKey !== undefined ? (event, node) => {
    if (event.kind === "key" && isActivationKey(event.code)) interaction.pressed.set(event.phase !== "release");
    return onKey?.(event, node);
  } : undefined;
  const hoverHandler: EventHandler = (event, node) => {
    // Slate calls the same handler when a hovered target is entered and when
    // it is left. The local bit therefore toggles exactly once per transition.
    interaction.hovered.update(value => !value);
    return onHover?.(event, node);
  };
  const focusHandler = (node: ComponentTreeNode): EventResult | void => {
    interaction.focused.set(true);
    return onFocus?.(node);
  };
  const blurHandler = (node: ComponentTreeNode): EventResult | void => {
    interaction.focused.set(false);
    interaction.pressed.set(false);
    return onBlur?.(node);
  };

  const view: SlateComponent = (injectedProps = {}) => {
    const visual = resolveNodeVisual(kind, {
      tone,
      role,
      shape,
      states,
      background,
      foreground,
      border,
      textStyle,
      effect: effect === undefined ? undefined : sanitizeExpressiveEffect(readReactive(effect)),
      disabled: props.disabled === true
    }, interaction, tokens);
    const nodeProps: NodeProps = {
      ...rest,
      // Composite containers may derive an id by cloning this function VNode.
      // Keep the captured props authoritative, but accept that one identity
      // override at the component boundary so Dock/Mosaic remain deterministic.
      id: sanitizeExpressiveId(id ?? injectedProps.id),
      children: sanitizeChild(children),
      background: visual.background,
      foreground: visual.foreground,
      border: visual.border,
      textStyle: visual.textStyle,
      ...(visual.effect ? { effect: visual.effect } : {}),
      style: mergeNodeStyle(kind, style, tokens),
      onHover: hoverHandler,
      onMouse: mouseHandler,
      onKey: keyHandler,
      onPress: (event, node) => {
        interaction.pressed.set(true);
        return onPress?.(event, node);
      },
      onFocus: focusHandler,
      onBlur: blurHandler
    };
    const capturePointer = kind === "button"
      ? props.capturePointer ?? true
      : onPress !== undefined || onMouse !== undefined
        ? props.capturePointer ?? true
        : props.capturePointer;
    if (kind === "button") return Button({ ...nodeProps, capturePointer });
    return Container({ ...nodeProps, capturePointer });
  };
  return createElement(view, {});
}

interface ResolvedStyleInput extends MaterialExpressiveStyleOptions {
  readonly disabled: boolean;
  readonly states?: Partial<Record<Exclude<MaterialExpressiveState, "idle">, MaterialExpressiveVisual>>;
}

function resolveNodeVisual(
  kind: "surface" | "button",
  input: ResolvedStyleInput,
  interaction: ExpressiveInteraction,
  tokens: MaterialExpressiveTokens
): MaterialExpressiveVisual {
  const base = kind === "button" ? materialExpressiveButtonStyle(input, tokens) : materialExpressiveSurfaceStyle(input, tokens);
  const active = input.disabled ? "disabled" : readInteractionState(interaction);
  if (active === "idle") return base;

  const stateVisual = defaultStateVisual(kind, active, input.role ?? "primary", tokens);
  // An explicit `border: false` is a caller contract. The default state
  // palette must not silently reintroduce a border; a user `states` override
  // can still opt into one for a particular interaction state.
  const defaultVisual = base.border === false ? { ...stateVisual, border: undefined } : stateVisual;
  let visual = applyVisual(base, defaultVisual, tokens);
  const override = input.states?.[active];
  visual = applyVisual(visual, override, tokens);
  const hasCustomEffect = override !== undefined && Object.prototype.hasOwnProperty.call(override, "effect");
  if (hasCustomEffect) {
    visual = { ...visual, effect: override?.effect === null ? undefined : sanitizeExpressiveEffect(override?.effect) };
  } else if (active === "disabled") {
    visual = { ...visual, effect: undefined };
  } else {
    visual = { ...visual, effect: tokens.motion[active] };
  }
  return visual;
}

function baseStyle(kind: "surface" | "button", options: MaterialExpressiveStyleOptions, tokens: MaterialExpressiveTokens): MaterialExpressiveVisual {
  const role = options.role ?? "primary";
  const surface = surfaceColors(options.tone ?? "surface", tokens.colors);
  const button = buttonColors(role, tokens.colors);
  const fallbackBackground = kind === "button" ? button.background : surface.background;
  const fallbackForeground = kind === "button" ? button.foreground : surface.foreground;
  const shape = normalizeShape(options.shape ?? "rounded");
  const fallbackBorder = expressiveBorder(tokens, shape, kind === "button" ? button.main : tokens.colors.outlineVariant);
  return {
    background: sanitizeExpressiveColor(options.background, fallbackBackground),
    foreground: sanitizeExpressiveColor(options.foreground, fallbackForeground),
    border: sanitizeBorder(options.border, fallbackBorder, tokens.colors.outlineVariant),
    shape,
    textStyle: sanitizeTextStyle(options.textStyle),
    effect: options.effect === null ? undefined : sanitizeExpressiveEffect(options.effect)
  };
}

function defaultStateVisual(kind: "surface" | "button", state: Exclude<MaterialExpressiveState, "idle">, role: MaterialExpressiveRole, tokens: MaterialExpressiveTokens): MaterialExpressiveVisual {
  const { colors } = tokens;
  if (state === "disabled") return {
    background: colors.surfaceContainerHigh,
    foreground: colors.onSurfaceVariant,
    border: expressiveBorder(tokens, "rounded", colors.outlineVariant),
    effect: null
  };
  if (kind === "surface") {
    if (state === "pressed") return { background: colors.surfaceVariant, foreground: colors.onSurface, shape: "double", border: expressiveBorder(tokens, "double", colors.outline) };
    if (state === "focus") return { background: colors.surfaceContainerHigh, foreground: colors.onSurface, shape: "heavy", border: expressiveBorder(tokens, "heavy", colors.tertiary) };
    return { background: colors.surfaceContainerHigh, foreground: colors.onSurface, border: expressiveBorder(tokens, "rounded", colors.outline) };
  }
  const palette = buttonColors(role, colors);
  if (state === "pressed") return { background: palette.container, foreground: palette.onContainer, shape: "double", border: expressiveBorder(tokens, "double", palette.main) };
  if (state === "focus") return { background: palette.container, foreground: palette.onContainer, shape: "heavy", border: expressiveBorder(tokens, "heavy", colors.tertiary) };
  return { background: palette.container, foreground: palette.onContainer, border: expressiveBorder(tokens, "rounded", palette.main) };
}

function applyVisual(base: MaterialExpressiveVisual, override: MaterialExpressiveVisual | undefined, tokens: MaterialExpressiveTokens): MaterialExpressiveVisual {
  if (!override) return base;
  let border = base.border;
  if (override.shape !== undefined && override.border === undefined) border = expressiveBorder(tokens, override.shape, borderColor(border, tokens.colors.outlineVariant));
  if (override.border !== undefined) {
    const fallback = border === false
      ? false
      : border && typeof border === "object"
        ? border
        : expressiveBorder(tokens, base.shape ?? "rounded", tokens.colors.outlineVariant);
    border = sanitizeBorder(override.border, fallback, tokens.colors.outlineVariant);
  }
  return {
    ...base,
    background: override.background === undefined ? base.background : sanitizeExpressiveColor(override.background, base.background ?? tokens.colors.surface),
    foreground: override.foreground === undefined ? base.foreground : sanitizeExpressiveColor(override.foreground, base.foreground ?? tokens.colors.onSurface),
    border,
    shape: override.shape ?? base.shape,
    textStyle: override.textStyle === undefined ? base.textStyle : sanitizeTextStyle(override.textStyle, base.textStyle),
    effect: override.effect === undefined ? base.effect : override.effect === null ? undefined : sanitizeExpressiveEffect(override.effect)
  };
}

function mergeNodeStyle(kind: "surface" | "button", style: NodeProps["style"], tokens: MaterialExpressiveTokens): NodeProps["style"] {
  const defaults = kind === "button"
    ? { paddingTop: tokens.spacing.xs, paddingBottom: tokens.spacing.xs, paddingLeft: tokens.spacing.md, paddingRight: tokens.spacing.md }
    : { padding: tokens.spacing.md };
  return { ...defaults, ...(style ?? {}) };
}

function readInteractionState(interaction: ExpressiveInteraction): Exclude<MaterialExpressiveState, "disabled"> {
  if (interaction.pressed.get()) return "pressed";
  if (interaction.focused.get()) return "focus";
  if (interaction.hovered.get()) return "hover";
  return "idle";
}

function surfaceColors(tone: MaterialExpressiveSurfaceTone, colors: MaterialExpressiveColors): { readonly background: string; readonly foreground: string } {
  switch (tone) {
    case "background": return { background: colors.background, foreground: colors.onBackground };
    case "surfaceContainer": return { background: colors.surfaceContainer, foreground: colors.onSurface };
    case "surfaceContainerHigh": return { background: colors.surfaceContainerHigh, foreground: colors.onSurface };
    case "surfaceVariant": return { background: colors.surfaceVariant, foreground: colors.onSurfaceVariant };
    case "primaryContainer": return { background: colors.primaryContainer, foreground: colors.onPrimaryContainer };
    case "secondaryContainer": return { background: colors.secondaryContainer, foreground: colors.onSecondaryContainer };
    case "tertiaryContainer": return { background: colors.tertiaryContainer, foreground: colors.onTertiaryContainer };
    case "surface":
    default: return { background: colors.surface, foreground: colors.onSurface };
  }
}

function buttonColors(role: MaterialExpressiveRole, colors: MaterialExpressiveColors): { readonly background: string; readonly foreground: string; readonly container: string; readonly onContainer: string; readonly main: string } {
  if (role === "secondary") return { background: colors.secondary, foreground: colors.onSecondary, container: colors.secondaryContainer, onContainer: colors.onSecondaryContainer, main: colors.secondary };
  if (role === "tertiary") return { background: colors.tertiary, foreground: colors.onTertiary, container: colors.tertiaryContainer, onContainer: colors.onTertiaryContainer, main: colors.tertiary };
  return { background: colors.primary, foreground: colors.onPrimary, container: colors.primaryContainer, onContainer: colors.onPrimaryContainer, main: colors.primary };
}

function sanitizeBorder(value: boolean | BorderSpec | undefined, fallback: BorderSpec | false, fallbackColor: string): BorderSpec | false {
  if (value === false) return false;
  if (value === true || value === undefined) return fallback;
  if (!isRecord(value)) return fallback;
  return Object.freeze({
    style: isBorderStyle(value.style) ? value.style : fallback === false ? "single" : fallback.style ?? "single",
    color: sanitizeExpressiveColor(value.color, fallback === false ? fallbackColor : fallback.color ?? fallbackColor)
  });
}

function sanitizeTextStyle(value: unknown, fallback?: TextStyle): TextStyle | undefined {
  if (value === undefined) return fallback;
  if (!isRecord(value)) return fallback;
  const result: TextStyle = {
    foreground: value.foreground === undefined ? fallback?.foreground : sanitizeExpressiveColor(value.foreground, fallback?.foreground ?? "#ffffff"),
    background: value.background === undefined ? fallback?.background : sanitizeExpressiveColor(value.background, fallback?.background ?? "#000000"),
    bold: typeof value.bold === "boolean" ? value.bold : fallback?.bold,
    dim: typeof value.dim === "boolean" ? value.dim : fallback?.dim,
    italic: typeof value.italic === "boolean" ? value.italic : fallback?.italic,
    underline: typeof value.underline === "boolean" ? value.underline : fallback?.underline,
    strikethrough: typeof value.strikethrough === "boolean" ? value.strikethrough : fallback?.strikethrough
  };
  return Object.freeze(Object.fromEntries(Object.entries(result).filter(([, item]) => item !== undefined)) as TextStyle);
}

function sanitizeChild(value: SlateChild): SlateChild {
  if (typeof value === "string") return sanitizeTerminalText(value);
  if (Array.isArray(value)) return value.map(sanitizeChild);
  return value;
}

function borderColor(border: boolean | BorderSpec | undefined, fallback: string): string {
  return border && typeof border === "object" ? sanitizeExpressiveColor(border.color, fallback) : fallback;
}

function normalizeShape(value: unknown): MaterialExpressiveShape {
  return value === "square" || value === "rounded" || value === "double" || value === "heavy" ? value : "rounded";
}

function normalizeHex(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (/^#[0-9a-fA-F]{3}$/u.test(text)) return `#${text.slice(1).split("").map(part => `${part}${part}`).join("").toLowerCase()}`;
  if (/^#[0-9a-fA-F]{6}$/u.test(text)) return text.toLowerCase();
  return undefined;
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, value));
}

function isBorderStyle(value: unknown): value is NonNullable<BorderSpec["style"]> {
  return value === "single" || value === "double" || value === "rounded" || value === "heavy";
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function isActivationKey(code: string | undefined): boolean {
  return code === "Enter" || code === "Return" || code === " " || code === "Space";
}

function isPrimaryPress(event: { readonly kind: string; readonly action?: string; readonly button?: string }): boolean {
  return event.kind === "mouse" && event.action === "press" && (event.button === undefined || event.button === "left");
}
