/**
 * Theme tokens for the built-in components.
 *
 * Every color the component library used to hard-code is a token here, with
 * the same default value, so restyling an application is a `setTheme` call
 * instead of a fork of the components. The active theme lives in a signal, so
 * changing it during a session re-renders the interfaces that read it.
 */

import { signal } from "./reactive.js";
import type { BorderSpec, ReadableSignal } from "./types.js";

export interface SlateTheme {
  readonly colors: Readonly<Record<string, string>>;
  readonly spacing: Readonly<Record<string, number>>;
  readonly radius?: Readonly<Record<string, number>>;
  /** Default border style used by `Panel`, `Card` and `Alert`. */
  readonly border?: BorderSpec["style"];
}

export const DEFAULT_THEME_COLORS: Readonly<Record<string, string>> = {
  primary: "#38bdf8",
  success: "#4ade80",
  warning: "#facc15",
  danger: "#fb7185",
  muted: "#64748b",
  background: "#0f172a",
  foreground: "#f8fafc",
  surface: "#151a24",
  border: "#475569",
  divider: "#475569",
  badge: "#334155",
  badgeForeground: "#ffffff",
  heading: "#ffffff",
  subheading: "#cbd5e1"
};

export const DEFAULT_THEME_SPACING: Readonly<Record<string, number>> = { xs: 0, sm: 1, md: 2, lg: 3, xl: 4 };

export function createTheme(theme: Partial<SlateTheme> = {}): SlateTheme {
  return {
    colors: { ...DEFAULT_THEME_COLORS, ...theme.colors },
    spacing: { ...DEFAULT_THEME_SPACING, ...theme.spacing },
    radius: theme.radius,
    border: theme.border
  };
}

const active = signal(createTheme());

/** Replaces the active theme and re-renders whoever reads it. */
export function setTheme(theme: Partial<SlateTheme> | SlateTheme): SlateTheme {
  const next = createTheme(theme);
  active.set(next);
  return next;
}

export function getTheme(): SlateTheme {
  return active.get();
}

/** The theme without subscribing, for code outside a render. */
export function peekTheme(): SlateTheme {
  return active.peek();
}

export function themeSignal(): ReadableSignal<SlateTheme> {
  return active;
}

export function themeColor(name: string, fallback?: string): string {
  return active.get().colors[name] ?? fallback ?? DEFAULT_THEME_COLORS[name] ?? "#ffffff";
}

export function themeSpacing(name: string, fallback = 0): number {
  return active.get().spacing[name] ?? fallback;
}

export function resetTheme(): SlateTheme {
  const theme = createTheme();
  active.set(theme);
  return theme;
}

/** Runs `body` with a temporary theme, restoring the previous one after. */
export function withTheme<T>(theme: Partial<SlateTheme>, body: () => T): T {
  const previous = active.peek();
  active.set(createTheme(theme));
  try {
    return body();
  } finally {
    active.set(previous);
  }
}
