import type { ReadableSignal, WritableSignal } from "./types.js";

export type ReactiveValue<T> = T | ReadableSignal<T>;
export type StateAction<S> = S | ((previous: S) => S);
export type Subscriber = () => void;

/** A computed signal owns an effect; `dispose` releases its subscriptions. */
export interface ComputedSignal<T> extends ReadableSignal<T> {
  readonly dispose: () => void;
}

export interface TrackedRun<T> {
  readonly value: T;
  readonly dependencies: readonly ReadableSignal<unknown>[];
  /** Releases every scope-owned resource created during the tracked run. */
  readonly dispose: () => void;
}

interface Scope {
  readonly dependencies: Set<ReadableSignal<unknown>>;
  readonly cleanups: Set<() => void>;
}

interface Observer extends Scope {
  readonly run: () => void;
  readonly dispose: () => void;
  active: boolean;
}

/**
 * Dependency tracking and batching live in a single process-wide context so
 * signals created by `@slate-terminal/core`, by this package, or by a duplicated
 * copy of either one observe the same reader and the same batch depth.
 */
interface ReactiveContext {
  observer: Scope | undefined;
  batchDepth: number;
  readonly pending: Set<Subscriber>;
}

const contextKey = Symbol.for("slate.reactive.context.v1");
const contextHost = globalThis as unknown as Record<symbol, ReactiveContext | undefined>;
const context: ReactiveContext = contextHost[contextKey] ?? (contextHost[contextKey] = { observer: undefined, batchDepth: 0, pending: new Set<Subscriber>() });

export function signal<T>(initial: T): WritableSignal<T> {
  let value = initial;
  const subscribers = new Set<Subscriber>();
  const subscribe = (listener: Subscriber) => {
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  };
  const target: WritableSignal<T> = {
    __slateSignal: true,
    get: () => {
      trackDependency(target as ReadableSignal<unknown>);
      return value;
    },
    peek: () => value,
    subscribe,
    set: action => {
      const next = typeof action === "function" ? (action as (previous: T) => T)(value) : action;
      if (Object.is(value, next)) return;
      value = next;
      notify(subscribers);
    },
    update: action => target.set(action)
  };
  return target;
}

/**
 * Derives a signal from other signals. The returned value owns an effect, so a
 * computed created inside another effect or inside a tracked render is released
 * with its owner; standalone computeds must be disposed by the caller.
 */
export function computed<T>(derive: () => T): ComputedSignal<T> {
  const state = signal(untracked(derive));
  const stop = effect(() => state.set(derive()));
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    stop();
  };
  context.observer?.cleanups.add(dispose);
  return {
    __slateSignal: true,
    get: state.get,
    peek: state.peek,
    subscribe: state.subscribe,
    dispose
  };
}

export function effect(run: () => void): () => void {
  let observer: Observer;
  const execute = () => {
    if (!observer.active) return;
    runCleanups(observer);
    observer.dependencies.clear();
    const previous = context.observer;
    context.observer = observer;
    try {
      run();
    } finally {
      context.observer = previous;
    }
    for (const dependency of observer.dependencies) observer.cleanups.add(dependency.subscribe(observer.run));
  };
  observer = {
    run: execute,
    dispose: () => {
      if (!observer.active) return;
      observer.active = false;
      runCleanups(observer);
      observer.dependencies.clear();
    },
    dependencies: new Set(),
    cleanups: new Set(),
    active: true
  };
  execute();
  return observer.dispose;
}

export function batch(run: () => void): void {
  context.batchDepth += 1;
  try {
    run();
  } finally {
    context.batchDepth -= 1;
    if (context.batchDepth === 0) {
      const subscribers = [...context.pending];
      context.pending.clear();
      for (const subscriber of subscribers) subscriber();
    }
  }
}

export function untracked<T>(run: () => T): T {
  const previous = context.observer;
  context.observer = undefined;
  try {
    return run();
  } finally {
    context.observer = previous;
  }
}

export function readReactive<T>(value: ReactiveValue<T>): T {
  return isSignal(value) ? value.get() : value;
}

export function isSignal(value: unknown): value is ReadableSignal<unknown> {
  return typeof value === "object" && value !== null && (value as ReadableSignal<unknown>).__slateSignal === true && typeof (value as ReadableSignal<unknown>).get === "function";
}

export function track<T>(run: () => T): TrackedRun<T> {
  const scope: Scope = { dependencies: new Set(), cleanups: new Set() };
  const previous = context.observer;
  context.observer = scope;
  try {
    const value = run();
    return { value, dependencies: [...scope.dependencies], dispose: () => runCleanups(scope) };
  } finally {
    context.observer = previous;
  }
}

function runCleanups(scope: Scope): void {
  const cleanups = [...scope.cleanups];
  scope.cleanups.clear();
  for (const cleanup of cleanups) cleanup();
}

function notify(subscribers: Set<Subscriber>): void {
  for (const subscriber of [...subscribers]) {
    if (context.batchDepth > 0) context.pending.add(subscriber);
    else subscriber();
  }
}

function trackDependency(value: ReadableSignal<unknown>): void {
  context.observer?.dependencies.add(value);
}
