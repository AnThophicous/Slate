import { readFile, realpath, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { inflateSync } from "node:zlib";

/** Characters are ordered from visually dark to visually light. */
export const DEFAULT_ASCII_CHARSET = "@%#*+=-:. ";
export const DEFAULT_ASCII_MAX_WIDTH = 80;
export const MAX_ASCII_WIDTH = 4096;
export const MAX_ASCII_ROWS = 4096;
export const MAX_RASTER_PIXELS = 16_777_216;
export const MAX_RASTER_BYTES = 64 * 1024 * 1024;

export type RasterChannels = 1 | 3 | 4;
export type RasterBytes = Uint8Array | Uint8ClampedArray;
export type BinaryImageInput = RasterBytes | ArrayBuffer;
export type AsciiColorMode = "none" | "ansi24";

/** A byte-backed raster. `stride` is measured in bytes, not pixels. */
export interface RasterInput {
  readonly width: number;
  readonly height: number;
  readonly data: RasterBytes;
  readonly channels?: RasterChannels;
  readonly stride?: number;
}

/** Canonical raster shape returned by the decoders. */
export interface RasterImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
  readonly channels: RasterChannels;
  readonly stride: number;
}

export interface AsciiOptions {
  /** Maximum output columns. Images are never enlarged horizontally. */
  readonly maxWidth?: number;
  /** Terminal cell height divided by terminal cell width. Defaults to 0.5. */
  readonly aspectRatio?: number;
  /** Ordered from dark to light; control characters and line breaks are rejected. */
  readonly charset?: string;
  /** Reverses the luminance-to-character mapping. */
  readonly invert?: boolean;
  /** Background used when compositing an RGBA pixel with alpha below 255. */
  readonly background?: readonly [number, number, number];
  /** ANSI is never emitted unless this is explicitly set to `ansi24`. */
  readonly color?: AsciiColorMode;
}

/** A file loader is deliberately sandboxed below this directory. */
export interface RasterFileOptions {
  readonly rootDir: string;
  readonly maxBytes?: number;
}

interface NormalizedAsciiOptions {
  readonly maxWidth: number;
  readonly aspectRatio: number;
  readonly charset: readonly string[];
  readonly invert: boolean;
  readonly background: readonly [number, number, number];
  readonly color: AsciiColorMode;
}

interface CellSample {
  readonly luminance: number;
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

interface Cursor {
  offset: number;
}

interface PngHeader {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colorType: number;
  readonly interlace: number;
}

/**
 * Validates and normalizes a caller-owned raster without copying its pixels.
 * A bare byte array is intentionally not accepted by the converter because it
 * has no reliable dimensions or channel count.
 */
export function validateRaster(input: RasterInput): RasterImage {
  if (!isRecord(input) || input instanceof Uint8Array || input instanceof Uint8ClampedArray) throw new TypeError("raster deve ser um objeto com dimensões e data");

  const width = input.width;
  const height = input.height;
  if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
    throw new RangeError("width e height devem ser inteiros positivos");
  }

  const pixels = checkedProduct(width, height, "dimensões do raster");
  const data = requireRasterBytes(input.data);
  let channels = input.channels;
  if (channels === undefined) {
    if (input.stride !== undefined) {
      throw new TypeError("channels é obrigatório quando stride é informado");
    }
    channels = inferChannels(data.length, pixels);
  }
  if (channels !== 1 && channels !== 3 && channels !== 4) {
    throw new RangeError("channels deve ser 1, 3 ou 4");
  }

  const minimumStride = checkedProduct(width, channels, "stride mínimo");
  const stride = input.stride ?? minimumStride;
  if (!isPositiveInteger(stride) || stride < minimumStride) {
    throw new RangeError("stride deve ser um inteiro positivo maior ou igual a width * channels");
  }
  const usedBytes = checkedProduct(stride, height, "tamanho do raster");
  if (usedBytes > data.length) {
    throw new RangeError("data é menor que stride * height");
  }
  if (usedBytes > MAX_RASTER_BYTES) {
    throw new RangeError(`raster excede o limite de ${MAX_RASTER_BYTES} bytes`);
  }

  return { width, height, data: asUint8Array(data), channels, stride };
}

/** Converts a validated RGB, RGBA or grayscale raster to plain text by default. */
export function rasterToAscii(input: RasterInput, options: AsciiOptions = {}): string {
  const raster = validateRaster(input);
  const normalized = normalizeAsciiOptions(options);
  const outputWidth = Math.min(raster.width, normalized.maxWidth);
  const calculatedHeight = Math.max(1, Math.round((raster.height / raster.width) * outputWidth * normalized.aspectRatio));
  if (calculatedHeight > MAX_ASCII_ROWS) {
    throw new RangeError(`a imagem produziria mais de ${MAX_ASCII_ROWS} linhas`);
  }

  const lines: string[] = [];
  for (let outputY = 0; outputY < calculatedHeight; outputY += 1) {
    const yStart = Math.min(raster.height - 1, Math.floor((outputY * raster.height) / calculatedHeight));
    const yEnd = Math.min(raster.height, Math.max(yStart + 1, Math.ceil(((outputY + 1) * raster.height) / calculatedHeight)));
    let line = "";
    for (let outputX = 0; outputX < outputWidth; outputX += 1) {
      const xStart = Math.min(raster.width - 1, Math.floor((outputX * raster.width) / outputWidth));
      const xEnd = Math.min(raster.width, Math.max(xStart + 1, Math.ceil(((outputX + 1) * raster.width) / outputWidth)));
      const sample = sampleCell(raster, xStart, xEnd, yStart, yEnd, normalized.background);
      const level = normalized.invert ? 1 - sample.luminance : sample.luminance;
      const character = normalized.charset[Math.min(normalized.charset.length - 1, Math.round(level * (normalized.charset.length - 1)))];
      line += normalized.color === "ansi24" && !isWhitespaceGlyph(character)
        ? colorize(character, sample)
        : character;
    }
    lines.push(line);
  }
  return lines.join("\n");
}

/** Alias with image-oriented naming for callers building a conversion pipeline. */
export function imageToAscii(input: RasterInput, options: AsciiOptions = {}): string {
  return rasterToAscii(input, options);
}

/** Parses binary or ASCII Netpbm PGM/PPM (P2, P3, P5 and P6). */
export function parsePnm(input: BinaryImageInput): RasterImage {
  const bytes = asBinaryBytes(input, "PNM");
  const cursor: Cursor = { offset: 0 };
  const magic = readPnmToken(bytes, cursor);
  if (magic !== "P2" && magic !== "P3" && magic !== "P5" && magic !== "P6") {
    throw new TypeError("PNM inválido: esperado P2, P3, P5 ou P6");
  }

  const width = readPositivePnmInteger(bytes, cursor, "width");
  const height = readPositivePnmInteger(bytes, cursor, "height");
  const maxValue = readPnmInteger(bytes, cursor, "maxval");
  if (maxValue < 1 || maxValue > 65_535) throw new RangeError("maxval do PNM deve estar entre 1 e 65535");

  const channels: RasterChannels = magic === "P2" || magic === "P5" ? 1 : 3;
  const binary = magic === "P5" || magic === "P6";
  const bytesPerSample = binary && maxValue > 255 ? 2 : 1;
  const pixels = checkedProduct(width, height, "dimensões do PNM");
  const sampleCount = checkedProduct(pixels, channels, "amostras do PNM");
  const expectedBinaryBytes = checkedProduct(sampleCount, bytesPerSample, "dados do PNM");
  if (expectedBinaryBytes > MAX_RASTER_BYTES) throw new RangeError("PNM excede o limite de entrada");

  if (binary) {
    const dataStart = consumeBinaryHeaderDelimiter(bytes, cursor);
    const dataEnd = dataStart + expectedBinaryBytes;
    if (dataEnd > bytes.length) throw new RangeError("PNM truncado: dados de pixels insuficientes");
    assertWhitespaceTail(bytes, dataEnd, "PNM");
    const data = new Uint8Array(sampleCount);
    if (bytesPerSample === 1 && maxValue === 255) {
      data.set(bytes.subarray(dataStart, dataEnd));
    } else {
      for (let index = 0; index < sampleCount; index += 1) {
        const sourceOffset = dataStart + index * bytesPerSample;
        const sample = bytesPerSample === 1 ? bytes[sourceOffset] : readUint16(bytes, sourceOffset);
        data[index] = scaleSample(sample, maxValue);
      }
    }
    return { width, height, data, channels, stride: width * channels };
  }

  const data = new Uint8Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = readPnmInteger(bytes, cursor, `sample ${index}`);
    if (sample < 0 || sample > maxValue) throw new RangeError(`sample ${index} excede maxval`);
    data[index] = scaleSample(sample, maxValue);
  }
  if (readPnmToken(bytes, cursor) !== undefined) throw new RangeError("PNM contém amostras além das dimensões declaradas");
  return { width, height, data, channels, stride: width * channels };
}

/** Parses a PGM image and rejects PPM input. */
export function parsePgm(input: BinaryImageInput): RasterImage {
  const raster = parsePnm(input);
  if (raster.channels !== 1) throw new TypeError("o conteúdo não é PGM");
  return raster;
}

/** Parses a PPM image and rejects PGM input. */
export function parsePpm(input: BinaryImageInput): RasterImage {
  const raster = parsePnm(input);
  if (raster.channels !== 3) throw new TypeError("o conteúdo não é PPM");
  return raster;
}

/**
 * Parses the supported self-identifying formats. PNG support is limited to
 * non-interlaced 8-bit images with color types 0, 2, 3, 4 and 6.
 */
export function decodeRaster(input: BinaryImageInput): RasterImage {
  const bytes = asBinaryBytes(input, "imagem");
  if (isPng(bytes)) return parsePng(bytes);
  const magic = bytes.length >= 2 ? String.fromCharCode(bytes[0], bytes[1]) : "";
  if (magic === "P2" || magic === "P5") return parsePgm(bytes);
  if (magic === "P3" || magic === "P6") return parsePpm(bytes);
  throw new TypeError("formato não suportado; use PNG 8-bit não interlaced, PGM ou PPM");
}

/**
 * Loads a supported image without shelling out or making network requests.
 * `rootDir` is required so path traversal and symlink escapes can be rejected.
 */
export async function loadRasterFile(filePath: string, options: RasterFileOptions): Promise<RasterImage> {
  validatePathText(filePath, "filePath");
  if (!isRecord(options)) throw new TypeError("rootDir é obrigatório para loadRasterFile");
  validatePathText(options.rootDir, "rootDir");
  const maxBytes = validateMaxBytes(options.maxBytes);

  const root = await realpath(resolve(options.rootDir));
  const requested = resolve(root, filePath);
  const candidate = await realpath(requested);
  if (!isWithin(root, candidate) || candidate === root) {
    throw new RangeError("filePath deve permanecer dentro de rootDir");
  }
  const metadata = await stat(candidate);
  if (!metadata.isFile()) throw new TypeError("filePath deve apontar para um arquivo regular");
  if (metadata.size > maxBytes) throw new RangeError(`arquivo excede o limite de ${maxBytes} bytes`);
  const bytes = await readFile(candidate);
  if (bytes.byteLength > maxBytes) throw new RangeError(`arquivo excede o limite de ${maxBytes} bytes`);
  return decodeRaster(bytes);
}

/** Parses a supported PNG without external image libraries. */
export function parsePng(input: BinaryImageInput): RasterImage {
  const bytes = asBinaryBytes(input, "PNG");
  if (!isPng(bytes)) throw new TypeError("assinatura PNG inválida");

  let header: PngHeader | undefined;
  let palette: Uint8Array | undefined;
  let transparency: Uint8Array | undefined;
  const compressedParts: Uint8Array[] = [];
  let compressedBytes = 0;
  let sawIdat = false;
  let idatClosed = false;
  let sawIend = false;
  let offset = 8;
  let chunkIndex = 0;

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new RangeError("PNG truncado no cabeçalho do chunk");
    const length = readUint32(bytes, offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + length;
    const chunkEnd = dataEnd + 4;
    if (length > MAX_RASTER_BYTES || dataEnd < dataOffset || chunkEnd > bytes.length) {
      throw new RangeError("chunk PNG excede os limites do arquivo");
    }
    const typeBytes = bytes.subarray(typeOffset, dataOffset);
    const type = String.fromCharCode(typeBytes[0], typeBytes[1], typeBytes[2], typeBytes[3]);
    const payload = bytes.subarray(dataOffset, dataEnd);
    const declaredCrc = readUint32(bytes, dataEnd);
    if (crc32(typeBytes, payload) !== declaredCrc) throw new RangeError(`CRC inválido no chunk PNG ${type}`);

    if (chunkIndex === 0 && type !== "IHDR") throw new TypeError("PNG deve começar por IHDR");
    if (type === "IHDR") {
      if (header !== undefined || length !== 13) throw new TypeError("IHDR PNG inválido");
      const width = readUint32(payload, 0);
      const height = readUint32(payload, 4);
      const bitDepth = payload[8];
      const colorType = payload[9];
      const compression = payload[10];
      const filter = payload[11];
      const interlace = payload[12];
      if (width < 1 || height < 1) throw new RangeError("dimensões PNG devem ser positivas");
      if (bitDepth !== 8) throw new TypeError("PNG suportado apenas com bit depth 8");
      if (![0, 2, 3, 4, 6].includes(colorType)) throw new TypeError(`color type PNG ${colorType} não suportado`);
      if (compression !== 0 || filter !== 0) throw new TypeError("método PNG de compressão/filtro não suportado");
      if (interlace !== 0) throw new TypeError("PNG interlaced não é suportado");
      header = { width, height, bitDepth, colorType, interlace };
      checkedProduct(width, height, "dimensões PNG");
    } else if (type === "PLTE") {
      if (sawIdat || palette !== undefined || length === 0 || length % 3 !== 0 || length > 768) throw new TypeError("PLTE PNG inválido");
      palette = new Uint8Array(payload);
    } else if (type === "tRNS") {
      if (sawIdat || transparency !== undefined) throw new TypeError("tRNS PNG duplicado ou fora de ordem");
      transparency = new Uint8Array(payload);
    } else if (type === "IDAT") {
      if (header === undefined || idatClosed) throw new TypeError("IDAT PNG fora de ordem");
      sawIdat = true;
      compressedBytes += length;
      if (compressedBytes > MAX_RASTER_BYTES) throw new RangeError("dados comprimidos PNG excedem o limite");
      compressedParts.push(payload);
    } else if (type === "IEND") {
      if (length !== 0 || sawIend) throw new TypeError("IEND PNG inválido");
      sawIend = true;
      offset = chunkEnd;
      break;
    } else if (isCriticalPngChunk(type)) {
      throw new TypeError(`chunk crítico PNG ${type} não suportado`);
    }

    if (sawIdat && type !== "IDAT") idatClosed = true;

    offset = chunkEnd;
    chunkIndex += 1;
  }

  if (header === undefined || !sawIdat || !sawIend) throw new RangeError("PNG deve conter IHDR, IDAT e IEND");
  if (offset !== bytes.length) throw new RangeError("PNG contém bytes depois de IEND");
  if (header.colorType === 3 && palette === undefined) throw new TypeError("PNG indexed sem PLTE");
  validatePngAncillary(header, palette, transparency);

  const inputBytesPerPixel = pngBytesPerPixel(header.colorType);
  const rowBytes = checkedProduct(header.width, inputBytesPerPixel, "linha PNG");
  const inflatedLength = checkedProduct(rowBytes + 1, header.height, "dados descomprimidos PNG");
  if (inflatedLength > MAX_RASTER_BYTES) throw new RangeError("PNG descomprimido excede o limite");
  const compressed = concatBytes(compressedParts, compressedBytes);
  let inflated: Uint8Array;
  try {
    inflated = new Uint8Array(inflateSync(compressed, { maxOutputLength: inflatedLength }));
  } catch (error) {
    throw new TypeError("dados IDAT PNG inválidos", { cause: error });
  }
  if (inflated.length !== inflatedLength) throw new RangeError("PNG descomprimido tem tamanho inesperado");
  const scanlines = unfilterPng(inflated, header.width, header.height, inputBytesPerPixel, rowBytes);
  return convertPngPixels(scanlines, header, palette, transparency);
}

function normalizeAsciiOptions(options: AsciiOptions): NormalizedAsciiOptions {
  if (typeof options !== "object" || options === null) throw new TypeError("opções ASCII devem ser um objeto");
  const maxWidth = options.maxWidth ?? DEFAULT_ASCII_MAX_WIDTH;
  if (!isPositiveInteger(maxWidth) || maxWidth > MAX_ASCII_WIDTH) {
    throw new RangeError(`maxWidth deve ser um inteiro entre 1 e ${MAX_ASCII_WIDTH}`);
  }
  const aspectRatio = options.aspectRatio ?? 0.5;
  if (typeof aspectRatio !== "number" || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    throw new RangeError("aspectRatio deve ser um número finito positivo");
  }
  const charsetValue = options.charset ?? DEFAULT_ASCII_CHARSET;
  if (typeof charsetValue !== "string") throw new TypeError("charset deve ser uma string");
  const charset = splitGraphemes(charsetValue);
  if (charset.length === 0) throw new RangeError("charset não pode ser vazio");
  if (charset.some(containsControlCharacter)) throw new TypeError("charset não pode conter controles ou quebras de linha");
  const invert = options.invert ?? false;
  if (typeof invert !== "boolean") throw new TypeError("invert deve ser booleano");
  const color = options.color ?? "none";
  if (color !== "none" && color !== "ansi24") throw new TypeError("color deve ser none ou ansi24");
  const background = validateRgb(options.background ?? [255, 255, 255], "background");
  return { maxWidth, aspectRatio, charset, invert, background, color };
}

function sampleCell(raster: RasterImage, xStart: number, xEnd: number, yStart: number, yEnd: number, background: readonly [number, number, number]): CellSample {
  let luminance = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const sourceOffset = y * raster.stride + x * raster.channels;
      const alpha = raster.channels === 4 ? raster.data[sourceOffset + 3] / 255 : 1;
      const sourceRed = raster.channels === 1 ? raster.data[sourceOffset] : raster.data[sourceOffset];
      const sourceGreen = raster.channels === 1 ? sourceRed : raster.data[sourceOffset + 1];
      const sourceBlue = raster.channels === 1 ? sourceRed : raster.data[sourceOffset + 2];
      const pixelRed = sourceRed * alpha + background[0] * (1 - alpha);
      const pixelGreen = sourceGreen * alpha + background[1] * (1 - alpha);
      const pixelBlue = sourceBlue * alpha + background[2] * (1 - alpha);
      red += pixelRed;
      green += pixelGreen;
      blue += pixelBlue;
      luminance += relativeLuminance(pixelRed, pixelGreen, pixelBlue);
      count += 1;
    }
  }
  return { luminance: luminance / count, red: Math.round(red / count), green: Math.round(green / count), blue: Math.round(blue / count) };
}

function relativeLuminance(red: number, green: number, blue: number): number {
  return 0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue);
}

function toLinear(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function colorize(character: string, sample: CellSample): string {
  return `\u001b[38;2;${sample.red};${sample.green};${sample.blue}m${character}\u001b[39m`;
}

function isWhitespaceGlyph(value: string): boolean {
  return value.trim().length === 0;
}

function validateRgb(value: readonly [number, number, number], name: string): readonly [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3 || value.some(channel => !isByte(channel))) {
    throw new RangeError(`${name} deve conter exatamente três inteiros entre 0 e 255`);
  }
  return [value[0], value[1], value[2]];
}

function requireRasterBytes(value: unknown): RasterBytes {
  if (value instanceof Uint8Array || value instanceof Uint8ClampedArray) return value;
  throw new TypeError("data deve ser Uint8Array ou Uint8ClampedArray");
}

function inferChannels(length: number, pixels: number): RasterChannels {
  for (const candidate of [1, 3, 4] as const) {
    if (length === pixels * candidate) return candidate;
  }
  throw new RangeError("channels é obrigatório quando o tamanho de data não permite inferência");
}

function asUint8Array(value: RasterBytes): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function asBinaryBytes(value: BinaryImageInput, label: string): Uint8Array {
  let bytes: Uint8Array;
  if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
  else if (value instanceof Uint8Array) bytes = value;
  else if (value instanceof Uint8ClampedArray) bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  else throw new TypeError(`${label} deve ser Uint8Array, Uint8ClampedArray ou ArrayBuffer`);
  if (bytes.byteLength === 0) throw new RangeError(`${label} não pode ser vazio`);
  if (bytes.byteLength > MAX_RASTER_BYTES) throw new RangeError(`${label} excede o limite de ${MAX_RASTER_BYTES} bytes`);
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isByte(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255;
}

function checkedProduct(left: number, right: number, label: string): number {
  const result = left * right;
  if (!Number.isSafeInteger(result) || result < 1) throw new RangeError(`${label} inválidas`);
  if (result > MAX_RASTER_PIXELS && (label.includes("dimensões") || label.includes("pixels"))) {
    throw new RangeError(`raster excede o limite de ${MAX_RASTER_PIXELS} pixels`);
  }
  return result;
}

function readPnmToken(bytes: Uint8Array, cursor: Cursor): string | undefined {
  skipPnmSeparators(bytes, cursor);
  if (cursor.offset >= bytes.length) return undefined;
  const start = cursor.offset;
  while (cursor.offset < bytes.length && !isPnmWhitespace(bytes[cursor.offset]) && bytes[cursor.offset] !== 0x23) cursor.offset += 1;
  if (cursor.offset === start) return undefined;
  let token = "";
  for (let index = start; index < cursor.offset; index += 1) {
    const value = bytes[index];
    if (value > 0x7f) throw new TypeError("token PNM deve ser ASCII");
    token += String.fromCharCode(value);
  }
  return token;
}

function skipPnmSeparators(bytes: Uint8Array, cursor: Cursor): void {
  while (cursor.offset < bytes.length) {
    if (isPnmWhitespace(bytes[cursor.offset])) {
      cursor.offset += 1;
      continue;
    }
    if (bytes[cursor.offset] === 0x23) {
      while (cursor.offset < bytes.length && bytes[cursor.offset] !== 0x0a) cursor.offset += 1;
      continue;
    }
    break;
  }
}

function consumeBinaryHeaderDelimiter(bytes: Uint8Array, cursor: Cursor): number {
  if (cursor.offset >= bytes.length || !isPnmWhitespace(bytes[cursor.offset])) {
    throw new TypeError("PNM binário sem separador depois de maxval");
  }
  const delimiter = bytes[cursor.offset];
  cursor.offset += 1;
  if (delimiter === 0x0d && bytes[cursor.offset] === 0x0a) cursor.offset += 1;
  return cursor.offset;
}

function isPnmWhitespace(value: number): boolean {
  return value === 0x09 || value === 0x0a || value === 0x0b || value === 0x0c || value === 0x0d || value === 0x20;
}

function readPnmInteger(bytes: Uint8Array, cursor: Cursor, label: string): number {
  const token = readPnmToken(bytes, cursor);
  if (token === undefined || !/^\d+$/.test(token)) throw new TypeError(`${label} PNM inválido`);
  const value = Number(token);
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} PNM excede o limite numérico`);
  return value;
}

function readPositivePnmInteger(bytes: Uint8Array, cursor: Cursor, label: string): number {
  const value = readPnmInteger(bytes, cursor, label);
  if (!isPositiveInteger(value)) throw new RangeError(`${label} PNM deve ser positivo`);
  return value;
}

function scaleSample(value: number, maxValue: number): number {
  return Math.max(0, Math.min(255, Math.round((value * 255) / maxValue)));
}

function assertWhitespaceTail(bytes: Uint8Array, offset: number, format: string): void {
  for (let index = offset; index < bytes.length; index += 1) {
    if (!isPnmWhitespace(bytes[index])) throw new RangeError(`${format} contém dados depois do raster`);
  }
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) throw new RangeError("leitura uint16 fora dos limites");
  return bytes[offset] * 256 + bytes[offset + 1];
}

function readUint32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) throw new RangeError("leitura uint32 fora dos limites");
  const value = bytes[offset] * 0x1000000 + bytes[offset + 1] * 0x10000 + bytes[offset + 2] * 0x100 + bytes[offset + 3];
  if (!Number.isSafeInteger(value)) throw new RangeError("uint32 PNG inválido");
  return value;
}

function isCriticalPngChunk(type: string): boolean {
  return type.length > 0 && type.charCodeAt(0) >= 0x41 && type.charCodeAt(0) <= 0x5a;
}

function validatePngAncillary(header: PngHeader, palette: Uint8Array | undefined, transparency: Uint8Array | undefined): void {
  if (header.colorType === 3) {
    if (palette === undefined || palette.length < 3 || palette.length > 768 || palette.length % 3 !== 0) throw new TypeError("PLTE PNG inválido");
    if (transparency !== undefined && transparency.length > palette.length / 3) throw new TypeError("tRNS PNG excede a paleta");
  } else if (header.colorType === 0) {
    if (transparency !== undefined && transparency.length !== 2) throw new TypeError("tRNS grayscale PNG inválido");
  } else if (header.colorType === 2) {
    if (transparency !== undefined && transparency.length !== 6) throw new TypeError("tRNS RGB PNG inválido");
  } else if (transparency !== undefined) {
    throw new TypeError("tRNS não é válido para este color type PNG");
  }
}

function pngBytesPerPixel(colorType: number): number {
  if (colorType === 0 || colorType === 3) return 1;
  if (colorType === 2) return 3;
  if (colorType === 4) return 2;
  if (colorType === 6) return 4;
  throw new TypeError("color type PNG não suportado");
}

function concatBytes(parts: readonly Uint8Array[], length: number): Uint8Array {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function unfilterPng(inflated: Uint8Array, width: number, height: number, bytesPerPixel: number, rowBytes: number): Uint8Array {
  const result = new Uint8Array(rowBytes * height);
  let sourceOffset = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowOffset = row * rowBytes;
    for (let column = 0; column < rowBytes; column += 1) {
      const filtered = inflated[sourceOffset + column];
      const left = column >= bytesPerPixel ? result[rowOffset + column - bytesPerPixel] : 0;
      const above = row > 0 ? result[rowOffset - rowBytes + column] : 0;
      const aboveLeft = row > 0 && column >= bytesPerPixel ? result[rowOffset - rowBytes + column - bytesPerPixel] : 0;
      if (filter === 0) result[rowOffset + column] = filtered;
      else if (filter === 1) result[rowOffset + column] = (filtered + left) & 0xff;
      else if (filter === 2) result[rowOffset + column] = (filtered + above) & 0xff;
      else if (filter === 3) result[rowOffset + column] = (filtered + Math.floor((left + above) / 2)) & 0xff;
      else if (filter === 4) result[rowOffset + column] = (filtered + paeth(above, left, aboveLeft)) & 0xff;
      else throw new TypeError(`filtro PNG ${filter} não suportado`);
    }
    sourceOffset += rowBytes;
  }
  return result;
}

function paeth(above: number, left: number, aboveLeft: number): number {
  const estimate = above + left - aboveLeft;
  const distanceAbove = Math.abs(estimate - above);
  const distanceLeft = Math.abs(estimate - left);
  const distanceAboveLeft = Math.abs(estimate - aboveLeft);
  if (distanceAbove <= distanceLeft && distanceAbove <= distanceAboveLeft) return above;
  if (distanceLeft <= distanceAboveLeft) return left;
  return aboveLeft;
}

function convertPngPixels(scanlines: Uint8Array, header: PngHeader, palette: Uint8Array | undefined, transparency: Uint8Array | undefined): RasterImage {
  const pixelCount = checkedProduct(header.width, header.height, "pixels PNG");
  if (header.colorType === 0 && transparency === undefined) {
    return { width: header.width, height: header.height, data: scanlines, channels: 1, stride: header.width };
  }
  if (header.colorType === 2 && transparency === undefined) {
    return { width: header.width, height: header.height, data: scanlines, channels: 3, stride: header.width * 3 };
  }
  if (header.colorType === 6) {
    return { width: header.width, height: header.height, data: scanlines, channels: 4, stride: header.width * 4 };
  }

  const data = new Uint8Array(pixelCount * 4);
  if (header.colorType === 3) {
    if (palette === undefined) throw new TypeError("PNG indexed sem paleta");
    for (let index = 0; index < pixelCount; index += 1) {
      const paletteIndex = scanlines[index];
      const paletteOffset = paletteIndex * 3;
      if (paletteOffset + 2 >= palette.length) throw new RangeError("índice PNG fora da paleta");
      const outputOffset = index * 4;
      data[outputOffset] = palette[paletteOffset];
      data[outputOffset + 1] = palette[paletteOffset + 1];
      data[outputOffset + 2] = palette[paletteOffset + 2];
      data[outputOffset + 3] = transparency?.[paletteIndex] ?? 255;
    }
  } else if (header.colorType === 4) {
    for (let index = 0; index < pixelCount; index += 1) {
      const sourceOffset = index * 2;
      const outputOffset = index * 4;
      data[outputOffset] = scanlines[sourceOffset];
      data[outputOffset + 1] = scanlines[sourceOffset];
      data[outputOffset + 2] = scanlines[sourceOffset];
      data[outputOffset + 3] = scanlines[sourceOffset + 1];
    }
  } else if (header.colorType === 0 && transparency !== undefined) {
    const transparent = readUint16(transparency, 0);
    if (transparent > 255) throw new RangeError("tRNS grayscale PNG excede bit depth");
    for (let index = 0; index < pixelCount; index += 1) {
      const gray = scanlines[index];
      const outputOffset = index * 4;
      data[outputOffset] = gray;
      data[outputOffset + 1] = gray;
      data[outputOffset + 2] = gray;
      data[outputOffset + 3] = gray === transparent ? 0 : 255;
    }
  } else if (header.colorType === 2 && transparency !== undefined) {
    const transparentRed = readUint16(transparency, 0);
    const transparentGreen = readUint16(transparency, 2);
    const transparentBlue = readUint16(transparency, 4);
    if (transparentRed > 255 || transparentGreen > 255 || transparentBlue > 255) throw new RangeError("tRNS RGB PNG excede bit depth");
    for (let index = 0; index < pixelCount; index += 1) {
      const sourceOffset = index * 3;
      const outputOffset = index * 4;
      const red = scanlines[sourceOffset];
      const green = scanlines[sourceOffset + 1];
      const blue = scanlines[sourceOffset + 2];
      data[outputOffset] = red;
      data[outputOffset + 1] = green;
      data[outputOffset + 2] = blue;
      data[outputOffset + 3] = red === transparentRed && green === transparentGreen && blue === transparentBlue ? 0 : 255;
    }
  } else {
    throw new TypeError("combinação de color type PNG não suportada");
  }
  return { width: header.width, height: header.height, data, channels: 4, stride: header.width * 4 };
}

function validatePathText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\u0000")) throw new TypeError(`${label} deve ser um caminho não vazio sem NUL`);
  if (/^[a-z][a-z\d+.-]*:/iu.test(value) && !/^[a-z]:[\\/]/iu.test(value)) throw new TypeError(`${label} não aceita URLs ou esquemas`);
}

function validateMaxBytes(value: number | undefined): number {
  const maxBytes = value ?? MAX_RASTER_BYTES;
  if (!isPositiveInteger(maxBytes) || maxBytes > MAX_RASTER_BYTES) throw new RangeError(`maxBytes deve estar entre 1 e ${MAX_RASTER_BYTES}`);
  return maxBytes;
}

function isWithin(root: string, candidate: string): boolean {
  const relation = relative(root, candidate);
  return relation !== "" && relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolutePath(relation);
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || /^[a-z]:[\\/]/iu.test(value) || value.startsWith("\\\\");
}

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f) || codePoint === 0x2028 || codePoint === 0x2029) return true;
  }
  return false;
}

function splitGraphemes(value: string): string[] {
  const Segmenter = (Intl as typeof Intl & { Segmenter?: new (locale?: string, options?: { granularity: "grapheme" }) => { segment(input: string): Iterable<{ segment: string }> } }).Segmenter;
  return Segmenter ? [...new Segmenter(undefined, { granularity: "grapheme" }).segment(value)].map(item => item.segment) : [...value];
}

let crcTable: Uint32Array | undefined;

function crc32(type: Uint8Array, payload: Uint8Array): number {
  crcTable ??= createCrcTable();
  let crc = 0xffffffff;
  for (const byte of type) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  for (const byte of payload) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
}
