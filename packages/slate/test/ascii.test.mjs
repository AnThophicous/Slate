import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import {
  DEFAULT_ASCII_CHARSET,
  MAX_ASCII_ROWS,
  MAX_ASCII_WIDTH,
  MAX_RASTER_PIXELS,
  decodeRaster,
  imageToAscii,
  loadRasterFile,
  parsePgm,
  parsePnm,
  parsePng,
  parsePpm,
  rasterToAscii,
  validateRaster
} from "../dist/ascii.js";

function raster(width, height, data, channels, stride) {
  return { width, height, data: Uint8Array.from(data), ...(channels === undefined ? {} : { channels }), ...(stride === undefined ? {} : { stride }) };
}

function pngChunk(type, payload) {
  const typeBytes = Uint8Array.from(type, character => character.charCodeAt(0));
  const bytes = new Uint8Array(12 + payload.length);
  writeUint32(bytes, 0, payload.length);
  bytes.set(typeBytes, 4);
  bytes.set(payload, 8);
  writeUint32(bytes, 8 + payload.length, crc32(typeBytes, payload));
  return bytes;
}

function makePng(width, height, colorType, scanlines, bitDepth = 8, ancillary = [], interlace = 0) {
  const bytesPerPixel = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 6 ? 4 : 1;
  const raw = Uint8Array.from(scanlines);
  assert.equal(raw.length, height * (width * bytesPerPixel + 1));
  const ihdr = new Uint8Array(13);
  writeUint32(ihdr, 0, width);
  writeUint32(ihdr, 4, height);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  ihdr[12] = interlace;
  const signature = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const chunks = [signature, pngChunk("IHDR", ihdr), ...ancillary, pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", new Uint8Array())];
  const result = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function writeUint32(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

let crcTable;
function crc32(type, payload) {
  crcTable ??= Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  let crc = 0xffffffff;
  for (const byte of [...type, ...payload]) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

test("converte RGB por luminância perceptual sem ANSI por padrão", () => {
  const output = rasterToAscii(raster(3, 1, [255, 0, 0, 0, 255, 0, 0, 0, 255], 3), { maxWidth: 3, aspectRatio: 1, charset: "0123456789" });
  assert.equal(output, "261");
  assert.doesNotMatch(output, /\u001b/);
});

test("reduz largura, preserva linhas compostas só por espaços e corrige aspect ratio", () => {
  const image = raster(4, 2, [255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3);
  assert.equal(rasterToAscii(image, { maxWidth: 2, aspectRatio: 2, charset: "# " }), "  \n##");
  assert.equal(rasterToAscii(image, { maxWidth: 4, aspectRatio: 0.5, charset: "# " }), "    ");
});

test("aceita RGBA, background explícito e cor ANSI somente por opt-in", () => {
  const transparentRed = raster(1, 1, [255, 0, 0, 0], 4);
  assert.equal(rasterToAscii(transparentRed, { maxWidth: 1, aspectRatio: 1, charset: "# " }), " ");
  assert.equal(rasterToAscii(transparentRed, { maxWidth: 1, aspectRatio: 1, charset: "# ", background: [0, 0, 0] }), "#");
  const colored = rasterToAscii(raster(1, 1, [255, 0, 0], 3), { maxWidth: 1, aspectRatio: 1, charset: "# ", color: "ansi24" });
  assert.equal(colored, "\u001b[38;2;255;0;0m#\u001b[39m");
});

test("suporta charset Unicode e invert sem quebrar o número de células", () => {
  const output = imageToAscii(raster(2, 1, [0, 0, 0, 255, 255, 255], 3), { maxWidth: 2, aspectRatio: 1, charset: "░▒▓█" });
  assert.equal(output, "░█");
  assert.equal(rasterToAscii(raster(2, 1, [0, 0, 0, 255, 255, 255], 3), { maxWidth: 2, aspectRatio: 1, charset: "░▒▓█", invert: true }), "█░");
  assert.equal(DEFAULT_ASCII_CHARSET.at(0), "@");
});

test("valida raster, opções, limites e charset inseguro", () => {
  assert.throws(() => rasterToAscii(new Uint8Array([0])), /objeto/);
  assert.throws(() => validateRaster(raster(0, 1, [0], 1)), /positivos/);
  assert.throws(() => validateRaster(raster(MAX_RASTER_PIXELS + 1, 1, [0], 1)), /pixels/);
  assert.throws(() => validateRaster(raster(2, 1, [0], 1)), /menor/);
  assert.throws(() => validateRaster(raster(1, 1, [0, 0], 2)), /1, 3 ou 4/);
  assert.throws(() => validateRaster({ width: 1, height: 1, data: Uint8Array.of(0), channels: 1, stride: 2 }), /stride/);
  assert.throws(() => rasterToAscii(raster(1, 1, [0], 1), { maxWidth: 0 }), /maxWidth/);
  assert.throws(() => rasterToAscii(raster(1, 1, [0], 1), { maxWidth: MAX_ASCII_WIDTH + 1 }), /maxWidth/);
  assert.throws(() => rasterToAscii(raster(1, 1, [0], 1), { aspectRatio: 0 }), /aspectRatio/);
  assert.throws(() => rasterToAscii(raster(1, 1, [0], 1), { aspectRatio: Number.NaN }), /aspectRatio/);
  assert.throws(() => rasterToAscii(raster(1, 1, [0], 1), { aspectRatio: MAX_ASCII_ROWS + 1 }), /linhas/);
  assert.throws(() => rasterToAscii(raster(1, 1, [0], 1), { charset: "a\n" }), /controle/);
  assert.throws(() => rasterToAscii(raster(1, 1, [0], 1), { charset: "" }), /vazio/);
  assert.throws(() => rasterToAscii(raster(1, 1, [0], 1), { background: [0, 0, 256] }), /background/);
  assert.throws(() => rasterToAscii(raster(1, 1, [0], 1), { color: "ansi8" }), /color/);
  assert.throws(() => decodeRaster(new Uint8Array()), /vazio/);
});

test("lê P2/P5 PGM, comentários e amostras de 16 bits", () => {
  const asciiPgm = new TextEncoder().encode("P2\n# comentário\n2 1\n15\n0 15\n");
  assert.deepEqual(parsePgm(asciiPgm), { width: 2, height: 1, data: Uint8Array.of(0, 255), channels: 1, stride: 2 });
  const binaryPgm = Uint8Array.from([...new TextEncoder().encode("P5\n2 1\n255\n"), 0, 255]);
  assert.deepEqual(parsePgm(binaryPgm), { width: 2, height: 1, data: Uint8Array.of(0, 255), channels: 1, stride: 2 });
  const widePgm = Uint8Array.from([...new TextEncoder().encode("P5\n2 1\n65535\n"), 0, 0, 255, 255]);
  assert.deepEqual(parsePgm(widePgm).data, Uint8Array.of(0, 255));
});

test("lê P3/P6 PPM e rejeita payload inconsistente", () => {
  const asciiPpm = new TextEncoder().encode("P3\n2 1\n255\n255 0 0 0 255 0\n");
  assert.deepEqual(parsePpm(asciiPpm), { width: 2, height: 1, data: Uint8Array.of(255, 0, 0, 0, 255, 0), channels: 3, stride: 6 });
  const binaryPpm = Uint8Array.from([...new TextEncoder().encode("P6\n2 1\n255\n"), 255, 0, 0, 0, 0, 255]);
  assert.deepEqual(parsePpm(binaryPpm).data, Uint8Array.of(255, 0, 0, 0, 0, 255));
  assert.throws(() => parsePnm(new TextEncoder().encode("P2\n1 1\n255\n0 1\n")), /além/);
  assert.throws(() => parsePgm(asciiPpm), /não é PGM/);
  assert.throws(() => decodeRaster(new TextEncoder().encode("JFIF")), /não suportado/);
});

test("decodifica PNG 8-bit RGBA com filtro Sub e verifica CRC", () => {
  const png = makePng(2, 1, 6, [1, 255, 0, 0, 255, 1, 255, 0, 0]);
  const decoded = parsePng(png);
  assert.equal(decoded.channels, 4);
  assert.deepEqual(decoded.data, Uint8Array.of(255, 0, 0, 255, 0, 255, 0, 255));
  assert.deepEqual(decodeRaster(png), decoded);
  const corrupted = Uint8Array.from(png);
  corrupted[corrupted.length - 5] ^= 1;
  assert.throws(() => parsePng(corrupted), /CRC/);
});

test("decodifica os color types PNG declarados e todos os filtros básicos", () => {
  assert.deepEqual(parsePng(makePng(2, 1, 0, [0, 0, 255])).data, Uint8Array.of(0, 255));
  assert.deepEqual(parsePng(makePng(2, 1, 2, [0, 0, 255, 0, 0, 0, 255])).data, Uint8Array.of(0, 255, 0, 0, 0, 255));
  assert.deepEqual(parsePng(makePng(1, 1, 4, [0, 128, 127])).data, Uint8Array.of(128, 128, 128, 127));
  const palette = pngChunk("PLTE", Uint8Array.of(255, 0, 0, 0, 255, 0));
  assert.deepEqual(parsePng(makePng(2, 1, 3, [0, 0, 1], 8, [palette])).data, Uint8Array.of(255, 0, 0, 255, 0, 255, 0, 255));
  for (const filter of [0, 1, 2, 3, 4]) {
    const decoded = parsePng(makePng(1, 1, 6, [filter, 10, 20, 30, 255]));
    assert.deepEqual(decoded.data, Uint8Array.of(10, 20, 30, 255));
  }
});

test("PNG rejeita bit depth, interlace e filtro não contratados", () => {
  const invalidBitDepth = makePng(1, 1, 0, [0, 0], 4);
  assert.throws(() => parsePng(invalidBitDepth), /bit depth/);
  const invalidInterlace = makePng(1, 1, 0, [0, 0], 8, [], 1);
  assert.throws(() => parsePng(invalidInterlace), /interlaced/);
  const invalidFilter = makePng(1, 1, 0, [5, 0]);
  assert.throws(() => parsePng(invalidFilter), /filtro/);
});

test("loader local exige rootDir, limita bytes e bloqueia traversal/URL", async () => {
  const parent = await mkdtemp(join(tmpdir(), "slate-ascii-"));
  const root = join(parent, "root");
  const outside = join(parent, "outside.pgm");
  await mkdir(root);
  await writeFile(join(root, "pixel.pgm"), "P2\n1 1\n255\n0\n");
  await writeFile(outside, "P2\n1 1\n255\n255\n");
  try {
    const loaded = await loadRasterFile("pixel.pgm", { rootDir: root });
    assert.equal(loaded.width, 1);
    assert.equal(loaded.data[0], 0);
    await assert.rejects(loadRasterFile("../outside.pgm", { rootDir: root }), /rootDir/);
    await assert.rejects(loadRasterFile("https://example.com/image.png", { rootDir: root }), /URLs/);
    await assert.rejects(loadRasterFile("pixel.pgm", { rootDir: root, maxBytes: 1 }), /limite/);
    await assert.rejects(loadRasterFile("pixel.pgm"), /rootDir/);
    assert.equal((await readFile(join(root, "pixel.pgm"))).toString().startsWith("P2"), true);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
