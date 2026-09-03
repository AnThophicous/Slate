import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import type { MediaProtocol, MediaSource } from "./types.js";

export interface MediaRenderOptions {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly protocol?: MediaProtocol;
}

const mimeByExtension: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska"
};

/** Reads a local media file without embedding a filesystem path in the render tree. */
export function loadMediaFile(filePath: string, mimeType = mimeByExtension[extname(filePath).toLowerCase()] ?? "application/octet-stream"): MediaSource {
  if (!filePath || typeof filePath !== "string") throw new TypeError("filePath deve ser um caminho não vazio");
  if (!isMimeType(mimeType)) throw new TypeError("mimeType inválido");
  return { data: readFileSync(filePath), mimeType, name: basename(filePath) };
}

/** Creates a typed source from a data URI or an in-memory byte payload. */
export function createMediaSource(data: string | Uint8Array, mimeType: string, name?: string): MediaSource {
  if (!isMimeType(mimeType)) throw new TypeError("mimeType inválido");
  if (typeof data !== "string" && !(data instanceof Uint8Array)) throw new TypeError("data deve ser uma string ou Uint8Array");
  return { data, mimeType: mimeType.toLowerCase(), name };
}

/**
 * Encodes an image for a terminal protocol. Unsupported terminals return an
 * empty string, leaving Slate's accessible text fallback in place.
 */
export function renderMedia(source: MediaSource | string | undefined, options: MediaRenderOptions): string {
  const normalized = normalizeMediaSource(source);
  if (!normalized || !normalized.mimeType.startsWith("image/")) return "";
  const protocol = options.protocol && options.protocol !== "auto" ? options.protocol : detectMediaProtocol();
  if (protocol === "none") return "";
  const width = positiveDimension(options.width);
  const height = positiveDimension(options.height);
  const x = coordinate(options.x);
  const y = coordinate(options.y);
  const base64 = payloadToBase64(normalized.data);
  if (!base64) return "";
  if (protocol === "iterm2") return renderIterm2(base64, width, height, x, y);
  if (protocol === "kitty" && normalized.mimeType === "image/png") return renderKittyPng(base64, width, height, x, y);
  return "";
}

export function normalizeMediaSource(value: unknown): MediaSource | undefined {
  if (typeof value === "string") {
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/u.exec(value);
    if (!match || !isMimeType(match[1] ?? "")) return undefined;
    return { data: match[2] ?? "", mimeType: (match[1] ?? "").toLowerCase() };
  }
  if (!isRecord(value) || !(typeof value.data === "string" || value.data instanceof Uint8Array) || !isMimeType(value.mimeType)) return undefined;
  return { data: value.data, mimeType: value.mimeType.toLowerCase(), name: typeof value.name === "string" ? value.name : undefined };
}

export function detectMediaProtocol(): Exclude<MediaProtocol, "auto"> {
  const processLike = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process;
  const env = processLike?.env ?? {};
  if (env.KITTY_WINDOW_ID || env.TERM === "xterm-kitty") return "kitty";
  if (env.TERM_PROGRAM === "iTerm.app") return "iterm2";
  return "none";
}

function renderIterm2(base64: string, width: number, height: number, x: number, y: number): string {
  return `${cursorTo(x, y)}\u001b]1337;File=inline=1;preserveAspectRatio=1;width=${width};height=${height}:${base64}\u0007`;
}

function renderKittyPng(base64: string, width: number, height: number, x: number, y: number): string {
  const chunks = base64.match(/.{1,4096}/gu) ?? [];
  const transmissions = chunks.map((chunk, index) => {
    const last = index === chunks.length - 1;
    const placement = index === 0 ? `,c=${width},r=${height}` : "";
    return `\u001b_Ga=T,f=100,q=2,m=${last ? 0 : 1}${placement};${chunk}\u001b\\`;
  }).join("");
  return `${cursorTo(x, y)}${transmissions}`;
}

function cursorTo(x: number, y: number): string {
  return `\u001b[${Math.max(1, Math.floor(y) + 1)};${Math.max(1, Math.floor(x) + 1)}H`;
}

function positiveDimension(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

function coordinate(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function payloadToBase64(data: string | Uint8Array): string | undefined {
  if (typeof data === "string") {
    const dataUri = /^data:[^;,]+;base64,([A-Za-z0-9+/]*={0,2})$/u.exec(data);
    if (dataUri) return dataUri[1] ?? "";
    return /^[A-Za-z0-9+/]*={0,2}$/u.test(data) ? data : undefined;
  }
  return Buffer.from(data).toString("base64");
}

function isMimeType(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/iu.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
