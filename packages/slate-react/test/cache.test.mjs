import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  cacheEnabled,
  createMemoryCache,
  createSessionScratch,
  hashKey,
  openDiskCache,
  resolveCacheRoot
} from "../dist/index.js";

function scratchRoot() {
  return mkdtempSync(join(tmpdir(), "slate-cache-test-"));
}

test("o cache em memória respeita o limite e descarta o menos usado", () => {
  const cache = createMemoryCache({ maxEntries: 2 });
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.get("a"), 1);
  cache.set("c", 3);
  assert.equal(cache.get("b"), undefined, "b era o menos usado recentemente");
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("c"), 3);
  assert.equal(cache.size(), 2);
});

test("memoize calcula uma vez e conta acertos", () => {
  const cache = createMemoryCache({ maxEntries: 8 });
  let calls = 0;
  const compute = () => {
    calls += 1;
    return "valor";
  };
  assert.equal(cache.memoize("k", compute), "valor");
  assert.equal(cache.memoize("k", compute), "valor");
  assert.equal(calls, 1);
  assert.equal(cache.stats().hits, 1);
  assert.equal(cache.stats().misses, 1);
});

test("entradas expiram pelo ttl", () => {
  const cache = createMemoryCache({ ttlMs: 1 });
  cache.set("k", "v");
  const expiry = Date.now() + 5;
  while (Date.now() < expiry) {
    // Espera ativa curta: o ttl é de 1 ms e o teste não pode depender de timer.
  }
  assert.equal(cache.get("k"), undefined);
});

test("a raiz do cache é estável e segue a convenção do sistema operacional", () => {
  const windows = resolveCacheRoot({ platform: "win32", env: { LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" } });
  const mac = resolveCacheRoot({ platform: "darwin", env: {}, home: "/Users/x" });
  const linux = resolveCacheRoot({ platform: "linux", env: { XDG_CACHE_HOME: "/home/x/.cache" } });
  assert.match(windows, /AppData[\\/]Local[\\/]slate-terminal[\\/]v\d+\.\d+$/);
  assert.match(mac, /Library[\\/]Caches[\\/]slate-terminal[\\/]v\d+\.\d+$/);
  assert.match(linux, /\.cache[\\/]slate-terminal[\\/]v\d+\.\d+$/);
  assert.equal(resolveCacheRoot({ platform: "linux", env: { XDG_CACHE_HOME: "/home/x/.cache" } }), linux, "a mesma entrada devolve o mesmo diretório");
});

test("SLATE_CACHE_DIR tem prioridade e SLATE_CACHE=0 desliga o disco", () => {
  const dir = scratchRoot();
  try {
    assert.equal(resolveCacheRoot({ env: { SLATE_CACHE_DIR: dir } }), dir);
    assert.equal(cacheEnabled({ SLATE_CACHE: "0" }), false);
    assert.equal(cacheEnabled({ SLATE_CACHE: "off" }), false);
    assert.equal(cacheEnabled({}), true);
    const cache = openDiskCache({ dir, enabled: false });
    assert.equal(cache.enabled, false);
    assert.equal(cache.set("k", "v"), false);
    assert.equal(cache.get("k"), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("o cache em disco usa um único diretório de entradas", () => {
  const dir = scratchRoot();
  try {
    const cache = openDiskCache({ dir });
    for (let index = 0; index < 20; index += 1) cache.set(cache.key("entrada", index), `valor-${index}`);
    const directories = readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory());
    assert.deepEqual(directories.map(entry => entry.name), ["entries"], "nenhuma pasta nova por entrada");
    assert.equal(cache.stats().entries, 20);
    assert.equal(cache.getText(cache.key("entrada", 3)), "valor-3");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a chave é derivada do conteúdo", () => {
  const dir = scratchRoot();
  try {
    const cache = openDiskCache({ dir });
    assert.equal(cache.key("a", 1), cache.key("a", 1));
    assert.notEqual(cache.key("a", 1), cache.key("a", 2));
    assert.equal(hashKey(["a", 1]), cache.key("a", 1));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a limpeza remove entradas expiradas e respeita o limite de bytes", () => {
  const dir = scratchRoot();
  try {
    const cache = openDiskCache({ dir, ttlMs: 1000, maxBytes: 1024 * 1024 });
    const stale = cache.key("velha");
    cache.set(stale, "conteúdo");
    const entry = join(dir, "entries", `${stale}.slate`);
    const old = (Date.now() - 60_000) / 1000;
    utimesSync(entry, old, old);
    cache.set(cache.key("nova"), "conteúdo");
    const result = cache.sweep({ force: true });
    assert.equal(result.skipped, false);
    assert.equal(result.removed, 1);
    assert.equal(existsSync(entry), false);
    assert.equal(cache.has(cache.key("nova")), true);

    const limited = openDiskCache({ dir, maxBytes: 8, ttlMs: 60_000 });
    limited.set(limited.key("grande"), "x".repeat(64));
    const trimmed = limited.sweep({ force: true });
    assert.ok(trimmed.bytesAfter <= 8, `bytes após a limpeza: ${trimmed.bytesAfter}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a limpeza é pulada dentro do intervalo", () => {
  const dir = scratchRoot();
  try {
    const cache = openDiskCache({ dir, sweepIntervalMs: 60_000 });
    cache.set(cache.key("k"), "v");
    assert.equal(cache.sweep({ force: true }).skipped, false);
    assert.equal(cache.sweep().skipped, true, "a segunda limpeza no mesmo intervalo não roda");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("o scratch da sessão cria um diretório e o remove no close", () => {
  const dir = scratchRoot();
  try {
    const session = createSessionScratch({ dir, label: "sessao-1" });
    assert.equal(session.enabled, true);
    assert.equal(existsSync(session.dir), true);
    const file = session.file("frame.txt", "conteúdo");
    assert.equal(existsSync(file), true);
    session.close();
    assert.equal(existsSync(session.dir), false);
    session.close();
    assert.equal(session.closed(), true);
    assert.throws(() => session.file("outro.txt", "x"), /fechado/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("uma sessão nova remove o scratch abandonado por um processo morto", () => {
  const dir = scratchRoot();
  try {
    const abandoned = createSessionScratch({ dir, label: "sessao-morta" });
    const abandonedDir = abandoned.dir;
    const old = (Date.now() - 24 * 60 * 60 * 1000) / 1000;
    utimesSync(abandonedDir, old, old);
    assert.ok(statSync(abandonedDir).isDirectory());
    const fresh = createSessionScratch({ dir, label: "sessao-viva", staleMs: 60_000 });
    assert.equal(existsSync(abandonedDir), false, "o diretório antigo foi removido");
    assert.equal(existsSync(fresh.dir), true);
    fresh.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
