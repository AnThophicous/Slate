/**
 * Small, dependency-free text primitives shared by layout and ANSI output.
 * Terminal positions are measured in cells, while JavaScript strings are
 * measured in UTF-16 code units. Keeping this logic in one place prevents a
 * wide glyph or an emoji joined by ZWJ from being split in the middle.
 */

export function splitLines(value: string): string[] {
  return value.replace(/\r\n?/g, "\n").split("\n");
}

export function segmentGraphemes(value: string): string[] {
  const Segmenter = (Intl as typeof Intl & {
    Segmenter?: new (locale?: string, options?: { granularity: "grapheme" }) => {
      segment(input: string): Iterable<{ readonly segment: string }>;
    };
  }).Segmenter;
  if (Segmenter) return [...new Segmenter(undefined, { granularity: "grapheme" }).segment(value)].map(item => item.segment);
  return fallbackGraphemes(value);
}

export function graphemeWidth(value: string): number {
  const code = value.codePointAt(0) ?? 0;
  if (value.includes("\n") || value.includes("\r")) return 0;
  if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return value === "\t" ? 1 : 0;
  if (/^(?:\p{Mark}|\uFE0F|\u200D)/u.test(value)) return 0;
  if (/\p{Extended_Pictographic}/u.test(value) || [...value].some(isWideCodePoint)) return 2;
  return 1;
}

export function displayWidth(value: string): number {
  return segmentGraphemes(value).reduce((width, grapheme) => width + graphemeWidth(grapheme), 0);
}

/** Wraps at grapheme boundaries and preserves explicit newlines. */
export function wrapText(value: string, maxWidth: number): string[] {
  const width = Math.max(1, Math.floor(maxWidth));
  return splitLines(value).flatMap(line => wrapLine(line, width));
}

export function wrappedLineCount(value: string, maxWidth: number): number {
  return wrapText(value, maxWidth).length;
}

function wrapLine(value: string, maxWidth: number): string[] {
  if (value.length === 0) return [""];
  if (!Number.isFinite(maxWidth)) return [value];
  const result: string[] = [];
  let current = "";
  let currentWidth = 0;
  for (const grapheme of segmentGraphemes(value)) {
    const width = graphemeWidth(grapheme);
    if (width > 0 && current && currentWidth + width > maxWidth) {
      result.push(current);
      current = "";
      currentWidth = 0;
    }
    current += grapheme;
    currentWidth += width;
    if (currentWidth >= maxWidth) {
      result.push(current);
      current = "";
      currentWidth = 0;
    }
  }
  if (current || result.length === 0) result.push(current);
  return result;
}

function fallbackGraphemes(value: string): string[] {
  const result: string[] = [];
  for (const codePoint of [...value]) {
    const previous = result[result.length - 1];
    const joinsPrevious = previous !== undefined && (
      /^(?:\p{Mark}|\uFE0F)/u.test(codePoint)
      || codePoint === "\u200D"
      || previous.endsWith("\u200D")
      || (isRegionalIndicator(codePoint) && isRegionalIndicator(previous) && [...previous].length === 1)
    );
    if (joinsPrevious) result[result.length - 1] = previous + codePoint;
    else result.push(codePoint);
  }
  return result;
}

function isRegionalIndicator(value: string): boolean {
  const code = value.codePointAt(0) ?? 0;
  return code >= 0x1f1e6 && code <= 0x1f1ff;
}

function isWideCodePoint(value: string): boolean {
  const code = value.codePointAt(0) ?? 0;
  return code >= 0x1100 && (
    code <= 0x115f
    || code === 0x2329
    || code === 0x232a
    || (code >= 0x2e80 && code <= 0xa4cf)
    || (code >= 0xac00 && code <= 0xd7a3)
    || (code >= 0xf900 && code <= 0xfaff)
    || (code >= 0xfe10 && code <= 0xfe19)
    || (code >= 0xff01 && code <= 0xff60)
    || code >= 0x1f300
  );
}
