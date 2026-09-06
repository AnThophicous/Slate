/**
 * Cache pre-warming.
 *
 * The first frame of a terminal application pays for every measurement the
 * later frames reuse: grapheme segmentation, glyph widths, wrapping, SGR
 * strings and the frame buffer itself. None of that work depends on user
 * input, so it can run before the interface goes up.
 *
 * Two rules keep this honest. The warm-up never runs on the critical path it
 * is supposed to shorten: the async form yields between chunks and stops at a
 * budget or an abort signal. And what it warms is what the previous run
 * actually measured, persisted in the shared cache root, not a guess.
 */

import { openDiskCache, type DiskCache } from "./cache.js";
import { detectTerminalCapabilities, type TerminalCapabilities } from "./capabilities.js";
import { createFlexLayoutEngine, type Viewport } from "./flex.js";
import { graphemeWidth, segmentGraphemes, warmTextCaches } from "./text.js";
import { renderTreeToAnsi } from "./terminal.js";
import { Container, Text, resolveTree } from "./vnode.js";

export interface PrewarmOptions {
  readonly viewport?: Viewport;
  /** Text this application is known to draw. */
  readonly samples?: readonly string[];
  readonly widths?: readonly number[];
  /** Colors the interface uses, so their SGR strings are built up front. */
  readonly colors?: readonly string[];
  readonly capabilities?: TerminalCapabilities;
  /** Disk cache to read samples from and write them back to; false disables it. */
  readonly cache?: DiskCache | false;
  readonly budgetMs?: number;
  readonly signal?: AbortLike;
}

export interface AbortLike {
  readonly aborted: boolean;
}

export interface PrewarmResult {
  readonly graphemes: number;
  readonly samples: number;
  readonly styles: number;
  readonly frames: number;
  readonly durationMs: number;
  readonly cancelled: boolean;
  readonly persisted: boolean;
  readonly cacheDir?: string;
}

const SAMPLES_KEY = "prewarm-samples-v1";
const MAX_PERSISTED_SAMPLES = 256;
const MAX_SAMPLE_LENGTH = 200;
const DEFAULT_BUDGET_MS = 50;
const DEFAULT_VIEWPORT: Viewport = { width: 80, height: 24 };
const DEFAULT_COLORS = ["#ffffff", "#000000", "#94a3b8", "#22c55e", "#ef4444", "#eab308", "#3b82f6"];

const recorded = new Set<string>();

/** Registers text for the next warm-up, so the next start measures it up front. */
export function recordPrewarmSamples(samples: Iterable<string>): number {
  for (const sample of samples) {
    if (typeof sample !== "string" || sample.length === 0 || sample.length > MAX_SAMPLE_LENGTH) continue;
    if (recorded.size >= MAX_PERSISTED_SAMPLES) break;
    recorded.add(sample);
  }
  return recorded.size;
}

export function prewarmSamples(): readonly string[] {
  return [...recorded];
}

/** Synchronous warm-up. Ignores the budget: the caller asked to block. */
export function prewarmSync(options: PrewarmOptions = {}): PrewarmResult {
  const started = now();
  const plan = buildPlan(options);
  let graphemes = warmGlyphs(plan.glyphs);
  graphemes += warmTextCaches(plan.samples, plan.widths);
  const frames = warmFrames(plan);
  const persisted = persistSamples(plan);
  return {
    graphemes,
    samples: plan.samples.length,
    styles: plan.colors.length,
    frames,
    durationMs: now() - started,
    cancelled: false,
    persisted,
    cacheDir: plan.cache?.dir
  };
}

/**
 * Warms the caches without holding the event loop, stopping at `budgetMs` or
 * when `signal.aborted` turns true. Whatever was warmed before the stop stays
 * warm: a cancelled warm-up is never a corrupted one.
 */
export async function prewarm(options: PrewarmOptions = {}): Promise<PrewarmResult> {
  const started = now();
  const budget = options.budgetMs === undefined ? DEFAULT_BUDGET_MS : Math.max(0, options.budgetMs);
  const plan = buildPlan(options);
  const expired = (): boolean => options.signal?.aborted === true || now() - started >= budget;
  let graphemes = 0;
  let samples = 0;
  let frames = 0;
  let cancelled = false;

  for (const chunk of chunks(plan.glyphs, 64)) {
    if (expired()) {
      cancelled = true;
      break;
    }
    graphemes += warmGlyphs(chunk);
    await yieldToLoop();
  }

  if (!cancelled) {
    for (const chunk of chunks(plan.samples, 16)) {
      if (expired()) {
        cancelled = true;
        break;
      }
      graphemes += warmTextCaches(chunk, plan.widths);
      samples += chunk.length;
      await yieldToLoop();
    }
  }

  if (!cancelled && !expired()) frames = warmFrames(plan);
  else cancelled = true;

  const persisted = cancelled ? false : persistSamples(plan);
  return {
    graphemes,
    samples,
    styles: cancelled ? 0 : plan.colors.length,
    frames,
    durationMs: now() - started,
    cancelled,
    persisted,
    cacheDir: plan.cache?.dir
  };
}

interface PrewarmPlan {
  readonly viewport: Viewport;
  readonly samples: readonly string[];
  readonly widths: readonly number[];
  readonly colors: readonly string[];
  readonly glyphs: readonly string[];
  readonly capabilities: TerminalCapabilities;
  readonly cache: DiskCache | undefined;
}

function buildPlan(options: PrewarmOptions): PrewarmPlan {
  const viewport = options.viewport ?? DEFAULT_VIEWPORT;
  const capabilities = options.capabilities ?? detectTerminalCapabilities();
  const cache = options.cache === false ? undefined : options.cache ?? openDiskCache();
  const stored = cache ? readSamples(cache) : [];
  const samples = unique([...(options.samples ?? []), ...recorded, ...stored]).slice(0, MAX_PERSISTED_SAMPLES);
  return {
    viewport,
    samples,
    widths: options.widths ?? [viewport.width, Math.max(1, Math.floor(viewport.width / 2))],
    colors: options.colors ?? DEFAULT_COLORS,
    glyphs: commonGlyphs(capabilities),
    capabilities,
    cache
  };
}

function warmGlyphs(glyphs: Iterable<string>): number {
  let count = 0;
  for (const glyph of glyphs) {
    graphemeWidth(glyph);
    count += 1;
  }
  return count;
}

/**
 * Renders one synthetic frame at the target viewport. This is what fills the
 * pooled frame buffer and the SGR cache, so the first real frame allocates and
 * formats nothing new.
 */
function warmFrames(plan: PrewarmPlan): number {
  const children = plan.colors.map((color, index) => Text({ id: `prewarm:${index}`, text: plan.samples[index] ?? "Slate", foreground: color, background: plan.colors[(index + 1) % plan.colors.length] }));
  const tree = resolveTree(Container({ id: "prewarm", direction: "column", children }));
  if (!tree) return 0;
  const layout = createFlexLayoutEngine().layout(tree, plan.viewport);
  renderTreeToAnsi(tree, layout, plan.viewport, { colors: plan.capabilities.colors, unicode: plan.capabilities.unicode });
  return 1;
}

function persistSamples(plan: PrewarmPlan): boolean {
  if (!plan.cache?.enabled || plan.samples.length === 0) return false;
  const payload = plan.samples
    .filter(sample => sample.length > 0 && sample.length <= MAX_SAMPLE_LENGTH && !sample.includes("\n"))
    .slice(0, MAX_PERSISTED_SAMPLES)
    .join("\n");
  return plan.cache.set(SAMPLES_KEY, payload);
}

function readSamples(cache: DiskCache): readonly string[] {
  const payload = cache.getText(SAMPLES_KEY);
  if (!payload) return [];
  return payload.split("\n").filter(line => line.length > 0 && line.length <= MAX_SAMPLE_LENGTH);
}

function commonGlyphs(capabilities: TerminalCapabilities): readonly string[] {
  const ascii = Array.from({ length: 0x7f - 0x20 }, (_, index) => String.fromCharCode(0x20 + index));
  if (!capabilities.unicode) return ascii;
  const box = [...("┌┐└┘─│╔╗╚╝═║╭╮╰╯┏┓┗┛━┃")];
  const spinner = [...("⣋⣙⣹⣸⣼⣴⠦⠧⠇⠏")];
  const marks = [...("←↑→↓•…·▶◀✓✗")];
  return [...ascii, ...box, ...spinner, ...marks];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(value => typeof value === "string" && value.length > 0))];
}

function* chunks<T>(values: readonly T[], size: number): Generator<readonly T[]> {
  for (let index = 0; index < values.length; index += size) yield values.slice(index, index + size);
}

function yieldToLoop(): Promise<void> {
  return new Promise(resolve => {
    const immediate = (globalThis as typeof globalThis & { setImmediate?: (callback: () => void) => unknown }).setImmediate;
    if (immediate) immediate(() => resolve());
    else setTimeout(resolve, 0);
  });
}

function now(): number {
  const performanceLike = (globalThis as typeof globalThis & { performance?: { now?: () => number } }).performance;
  return performanceLike?.now?.() ?? Date.now();
}

/** Warms the grapheme table for a string without keeping it as a sample. */
export function warmString(value: string): number {
  return segmentGraphemes(value).reduce((count, grapheme) => count + (graphemeWidth(grapheme), 1), 0);
}
