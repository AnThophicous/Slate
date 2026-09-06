/**
 * Caching primitives shared by measurement, layout and ANSI output.
 *
 * Two rules shape this module. First, every bounded cache states its own limit:
 * an unbounded memo in a long-lived terminal application is a leak with extra
 * steps. Second, the disk layer uses exactly one directory tree, resolved from
 * the operating system convention and versioned once, so repeated runs reuse
 * the same root instead of scattering new folders across the temp directory.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

export interface CacheStats {
  readonly entries: number;
  readonly bytes: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
}

export interface MemoryCacheOptions<K, V> {
  /** Hard limit on retained entries. The least recently used entry is dropped first. */
  readonly maxEntries?: number;
  /** Optional weight limit, using `sizeOf` to measure each value. */
  readonly maxBytes?: number;
  readonly ttlMs?: number;
  readonly sizeOf?: (value: V, key: K) => number;
}

export interface MemoryCache<K, V> {
  readonly get: (key: K) => V | undefined;
  readonly set: (key: K, value: V) => V;
  readonly has: (key: K) => boolean;
  readonly delete: (key: K) => boolean;
  readonly clear: () => void;
  /** Returns the cached value, computing and storing it on a miss. */
  readonly memoize: (key: K, compute: (key: K) => V) => V;
  readonly stats: () => CacheStats;
  readonly size: () => number;
}

interface MemoryEntry<V> {
  value: V;
  bytes: number;
  expiresAt: number;
}

const DEFAULT_MAX_ENTRIES = 4096;

export function createMemoryCache<K, V>(options: MemoryCacheOptions<K, V> = {}): MemoryCache<K, V> {
  const maxEntries = positiveInteger(options.maxEntries, DEFAULT_MAX_ENTRIES);
  const maxBytes = options.maxBytes === undefined ? Number.POSITIVE_INFINITY : positiveInteger(options.maxBytes, Number.POSITIVE_INFINITY);
  const ttlMs = options.ttlMs === undefined ? Number.POSITIVE_INFINITY : positiveInteger(options.ttlMs, Number.POSITIVE_INFINITY);
  const sizeOf = options.sizeOf;
  // Map preserves insertion order, so re-inserting on read gives an LRU list
  // without a second data structure.
  const entries = new Map<K, MemoryEntry<V>>();
  let bytes = 0;
  let hits = 0;
  let misses = 0;
  let evictions = 0;

  const drop = (key: K): boolean => {
    const entry = entries.get(key);
    if (!entry) return false;
    entries.delete(key);
    bytes -= entry.bytes;
    return true;
  };

  const evict = (): void => {
    while (entries.size > maxEntries || bytes > maxBytes) {
      const oldest = entries.keys().next();
      if (oldest.done) break;
      drop(oldest.value);
      evictions += 1;
    }
  };

  const read = (key: K): MemoryEntry<V> | undefined => {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      drop(key);
      return undefined;
    }
    entries.delete(key);
    entries.set(key, entry);
    return entry;
  };

  const set = (key: K, value: V): V => {
    drop(key);
    const weight = sizeOf ? Math.max(0, sizeOf(value, key)) : 0;
    entries.set(key, { value, bytes: weight, expiresAt: ttlMs === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : Date.now() + ttlMs });
    bytes += weight;
    evict();
    return value;
  };

  return {
    get: key => {
      const entry = read(key);
      if (!entry) {
        misses += 1;
        return undefined;
      }
      hits += 1;
      return entry.value;
    },
    set,
    has: key => read(key) !== undefined,
    delete: key => drop(key),
    clear: () => {
      entries.clear();
      bytes = 0;
    },
    memoize: (key, compute) => {
      const entry = read(key);
      if (entry) {
        hits += 1;
        return entry.value;
      }
      misses += 1;
      return set(key, compute(key));
    },
    stats: () => ({ entries: entries.size, bytes, hits, misses, evictions }),
    size: () => entries.size
  };
}

export interface CacheRootOptions {
  /** Absolute directory to use verbatim, bypassing the platform convention. */
  readonly dir?: string;
  readonly namespace?: string;
  readonly version?: string;
  readonly platform?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly home?: string;
}

const NAMESPACE = "slate-terminal";

/**
 * Resolves the single cache root for this machine and Slate line.
 *
 * The path is stable across runs by construction: platform base directory,
 * one namespace folder, one version folder. Nothing here is derived from the
 * process id, the working directory or a random value, because a cache root
 * that changes per run is not a cache, it is litter in the temp directory.
 */
export function resolveCacheRoot(options: CacheRootOptions = {}): string {
  const env = options.env ?? processEnv();
  const explicit = options.dir ?? env.SLATE_CACHE_DIR;
  if (explicit) return resolve(explicit);
  const platform = options.platform ?? processPlatform();
  const home = options.home ?? env.HOME ?? env.USERPROFILE ?? safeHome();
  const namespace = options.namespace ?? NAMESPACE;
  const version = options.version ?? cacheLineVersion();
  return join(platformBase(platform, env, home), namespace, version);
}

function platformBase(platform: string, env: Readonly<Record<string, string | undefined>>, home: string): string {
  if (platform === "win32") return env.LOCALAPPDATA ?? env.APPDATA ?? (home ? join(home, "AppData", "Local") : tmpdir());
  if (platform === "darwin") return home ? join(home, "Library", "Caches") : tmpdir();
  return env.XDG_CACHE_HOME ?? (home ? join(home, ".cache") : tmpdir());
}

/** The cache line is major.minor: patch releases reuse the warm cache. */
function cacheLineVersion(): string {
  const [major = "2", minor = "3"] = CACHE_VERSION.split(".");
  return `v${major}.${minor}`;
}

const CACHE_VERSION = "2.3.0";

/** Reports whether the disk layer is allowed at all (`SLATE_CACHE=0` turns it off). */
export function cacheEnabled(env: Readonly<Record<string, string | undefined>> = processEnv()): boolean {
  const flag = env.SLATE_CACHE;
  if (flag === undefined) return true;
  return !/^(0|off|false|no)$/i.test(flag.trim());
}

export interface DiskCacheOptions extends CacheRootOptions {
  readonly enabled?: boolean;
  readonly maxBytes?: number;
  readonly maxEntries?: number;
  readonly ttlMs?: number;
  /** Minimum interval between sweeps, tracked by a stamp file in the root. */
  readonly sweepIntervalMs?: number;
}

export interface SweepResult {
  readonly scanned: number;
  readonly removed: number;
  readonly bytesBefore: number;
  readonly bytesAfter: number;
  readonly skipped: boolean;
}

export interface DiskCache {
  readonly dir: string;
  readonly enabled: boolean;
  /** Content-derived key: equal inputs reuse the same entry across runs. */
  readonly key: (...parts: readonly (string | number | Uint8Array)[]) => string;
  readonly get: (key: string) => Buffer | undefined;
  readonly getText: (key: string) => string | undefined;
  readonly set: (key: string, value: string | Uint8Array) => boolean;
  readonly has: (key: string) => boolean;
  readonly delete: (key: string) => boolean;
  readonly sweep: (options?: { readonly force?: boolean; readonly now?: number }) => SweepResult;
  readonly stats: () => { readonly entries: number; readonly bytes: number; readonly dir: string; readonly enabled: boolean };
  readonly clear: () => void;
}

const DEFAULT_DISK_BYTES = 32 * 1024 * 1024;
const DEFAULT_DISK_ENTRIES = 4096;
const DEFAULT_DISK_TTL = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_SWEEP_INTERVAL = 6 * 60 * 60 * 1000;
const ENTRY_SUFFIX = ".slate";

/**
 * Opens the shared on-disk cache. Entries are flat files inside a single
 * `entries` directory, never one directory per entry or per run.
 */
export function openDiskCache(options: DiskCacheOptions = {}): DiskCache {
  const env = options.env ?? processEnv();
  const dir = resolveCacheRoot(options);
  const entriesDir = join(dir, "entries");
  const stamp = join(dir, ".sweep");
  const maxBytes = positiveInteger(options.maxBytes, DEFAULT_DISK_BYTES);
  const maxEntries = positiveInteger(options.maxEntries, DEFAULT_DISK_ENTRIES);
  const ttlMs = positiveInteger(options.ttlMs, DEFAULT_DISK_TTL);
  const sweepIntervalMs = positiveInteger(options.sweepIntervalMs, DEFAULT_SWEEP_INTERVAL);
  let enabled = options.enabled ?? cacheEnabled(env);
  if (enabled) enabled = ensureDirectory(entriesDir);

  const entryPath = (key: string): string => join(entriesDir, `${sanitizeKey(key)}${ENTRY_SUFFIX}`);

  const list = (): readonly { readonly path: string; readonly bytes: number; readonly mtimeMs: number }[] => {
    if (!enabled) return [];
    try {
      return readdirSync(entriesDir)
        .filter(name => name.endsWith(ENTRY_SUFFIX))
        .flatMap(name => {
          const path = join(entriesDir, name);
          try {
            const info = statSync(path);
            return info.isFile() ? [{ path, bytes: info.size, mtimeMs: info.mtimeMs }] : [];
          } catch {
            return [];
          }
        });
    } catch {
      return [];
    }
  };

  const sweep = (sweepOptions: { readonly force?: boolean; readonly now?: number } = {}): SweepResult => {
    const now = sweepOptions.now ?? Date.now();
    if (!enabled) return { scanned: 0, removed: 0, bytesBefore: 0, bytesAfter: 0, skipped: true };
    if (!sweepOptions.force && !sweepDue(stamp, now, sweepIntervalMs)) {
      return { scanned: 0, removed: 0, bytesBefore: 0, bytesAfter: 0, skipped: true };
    }
    touch(stamp, now);
    const files = [...list()].sort((left, right) => right.mtimeMs - left.mtimeMs);
    const bytesBefore = files.reduce((total, file) => total + file.bytes, 0);
    let bytes = 0;
    let kept = 0;
    let removed = 0;
    for (const file of files) {
      const expired = now - file.mtimeMs > ttlMs;
      const overflow = kept + 1 > maxEntries || bytes + file.bytes > maxBytes;
      if (expired || overflow) {
        if (remove(file.path)) removed += 1;
        continue;
      }
      kept += 1;
      bytes += file.bytes;
    }
    return { scanned: files.length, removed, bytesBefore, bytesAfter: bytes, skipped: false };
  };

  return {
    dir,
    get enabled() {
      return enabled;
    },
    key: (...parts) => hashKey(parts),
    get: key => {
      if (!enabled) return undefined;
      const path = entryPath(key);
      try {
        const data = readFileSync(path);
        // Reading refreshes the entry so the sweep evicts by real usage.
        touch(path, Date.now());
        return data;
      } catch {
        return undefined;
      }
    },
    getText: key => {
      if (!enabled) return undefined;
      const path = entryPath(key);
      try {
        const data = readFileSync(path, "utf8");
        touch(path, Date.now());
        return data;
      } catch {
        return undefined;
      }
    },
    set: (key, value) => {
      if (!enabled) return false;
      try {
        writeFileSync(entryPath(key), value);
        return true;
      } catch {
        return false;
      }
    },
    has: key => enabled && existsSync(entryPath(key)),
    delete: key => enabled && remove(entryPath(key)),
    sweep,
    stats: () => {
      const files = list();
      return { entries: files.length, bytes: files.reduce((total, file) => total + file.bytes, 0), dir, enabled };
    },
    clear: () => {
      for (const file of list()) remove(file.path);
    }
  };
}

export interface SessionScratchOptions extends CacheRootOptions {
  readonly enabled?: boolean;
  readonly label?: string;
  /** Age after which a scratch directory left by a dead process is removed. */
  readonly staleMs?: number;
}

export interface SessionScratch {
  readonly dir: string;
  readonly enabled: boolean;
  /** Writes a file inside the session directory and returns its path. */
  readonly file: (name: string, data: string | Uint8Array) => string;
  readonly closed: () => boolean;
  /** Removes the whole session directory. Idempotent, and safe during a crash. */
  readonly close: () => void;
}

const DEFAULT_STALE_MS = 12 * 60 * 60 * 1000;

/**
 * Creates the one scratch directory a session is allowed to have.
 *
 * The directory is removed by `close()`, by process exit and by the next
 * session that finds it stale, so an interrupted run cannot leave a permanent
 * folder behind.
 */
export function createSessionScratch(options: SessionScratchOptions = {}): SessionScratch {
  const env = options.env ?? processEnv();
  const root = join(resolveCacheRoot(options), "sessions");
  const label = sanitizeKey(options.label ?? `${processId()}-${randomLabel()}`);
  const dir = join(root, label);
  let enabled = options.enabled ?? cacheEnabled(env);
  if (enabled) enabled = ensureDirectory(dir);
  if (enabled) sweepSessions(root, dir, positiveInteger(options.staleMs, DEFAULT_STALE_MS));
  let closed = false;

  const close = (): void => {
    if (closed) return;
    closed = true;
    detach();
    if (enabled) removeTree(dir);
  };

  const detach = registerExitCleanup(close);

  return {
    dir,
    get enabled() {
      return enabled && !closed;
    },
    file: (name, data) => {
      const path = join(dir, sanitizeKey(name));
      if (!enabled || closed) throw new Error("O scratch da sessão está fechado ou desabilitado.");
      writeFileSync(path, data);
      return path;
    },
    closed: () => closed,
    close
  };
}

function sweepSessions(root: string, current: string, staleMs: number): void {
  const now = Date.now();
  let names: readonly string[];
  try {
    names = readdirSync(root);
  } catch {
    return;
  }
  for (const name of names) {
    const path = join(root, name);
    if (path === current) continue;
    try {
      const info = statSync(path);
      if (info.isDirectory() && now - info.mtimeMs > staleMs) removeTree(path);
    } catch {
      // A directory removed by its own session between readdir and stat is the
      // expected outcome, not an error.
    }
  }
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

export function hashKey(parts: readonly (string | number | Uint8Array)[]): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    if (part instanceof Uint8Array) hash.update(part);
    else hash.update(String(part));
    hash.update("\u0000");
  }
  return hash.digest("hex").slice(0, 32);
}

function sweepDue(stamp: string, now: number, intervalMs: number): boolean {
  try {
    return now - statSync(stamp).mtimeMs >= intervalMs;
  } catch {
    return true;
  }
}

function touch(path: string, now: number): void {
  try {
    const seconds = now / 1000;
    utimesSync(path, seconds, seconds);
  } catch {
    try {
      writeFileSync(path, "");
    } catch {
      // The stamp is an optimization; failing to write it only means the next
      // run sweeps again.
    }
  }
}

function ensureDirectory(path: string): boolean {
  try {
    mkdirSync(path, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function remove(path: string): boolean {
  try {
    rmSync(path, { force: true });
    return true;
  } catch {
    return false;
  }
}

function removeTree(path: string): void {
  try {
    rmSync(path, { force: true, recursive: true });
  } catch {
    // Nothing else can be done here, and throwing during exit would mask the
    // original failure.
  }
}

function sanitizeKey(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9._-]/g, "_");
  return safe.length > 0 ? safe.slice(0, 120) : "entry";
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function processEnv(): Readonly<Record<string, string | undefined>> {
  return (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
}

function processPlatform(): string {
  return (globalThis as typeof globalThis & { process?: { platform?: string } }).process?.platform ?? "linux";
}

function processId(): number {
  return (globalThis as typeof globalThis & { process?: { pid?: number } }).process?.pid ?? 0;
}

function safeHome(): string {
  try {
    return homedir();
  } catch {
    return tmpdir();
  }
}

function randomLabel(): string {
  return Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
}
