import type { ReadableSignal, WritableSignal } from "./types.js";

export type ReactiveValue<T> = T | ReadableSignal<T>;
export type StateAction<S> = S | ((previous: S) => S);
export type Subscriber = () => void;

interface Observer {
  readonly run: () => void;
  readonly dispose: () => void;
  readonly dependencies: Set<ReadableSignal<unknown>>;
  readonly cleanups: Set<() => void>;
  active: boolean;
}

let activeObserver: Observer | undefined;
let batchDepth = 0;
const pendingSubscribers = new Set<Subscriber>();

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

export function computed<T>(derive: () => T): ReadableSignal<T> {
  const state = signal(derive());
  effect(() => state.set(derive()));
  return {
    __slateSignal: true,
    get: state.get,
    peek: state.peek,
    subscribe: state.subscribe
  };
}

export function effect(run: () => void): () => void {
  let observer: Observer;
  const execute = () => {
    if (!observer.active) return;
    for (const cleanup of observer.cleanups) cleanup();
    observer.cleanups.clear();
    observer.dependencies.clear();
    const previous = activeObserver;
    activeObserver = observer;
    try {
      run();
    } finally {
      activeObserver = previous;
    }
    for (const dependency of observer.dependencies) observer.cleanups.add(dependency.subscribe(observer.run));
  };
  observer = {
    run: execute,
    dispose: () => {
      if (!observer.active) return;
      observer.active = false;
      for (const cleanup of observer.cleanups) cleanup();
      observer.cleanups.clear();
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
  batchDepth += 1;
  try {
    run();
  } finally {
    batchDepth -= 1;
    if (batchDepth === 0) {
      const subscribers = [...pendingSubscribers];
      pendingSubscribers.clear();
      for (const subscriber of subscribers) subscriber();
    }
  }
}

export function untracked<T>(run: () => T): T {
  const previous = activeObserver;
  activeObserver = undefined;
  try {
    return run();
  } finally {
    activeObserver = previous;
  }
}

export function readReactive<T>(value: ReactiveValue<T>): T {
  return isSignal(value) ? value.get() : value;
}

export function isSignal(value: unknown): value is ReadableSignal<unknown> {
  return typeof value === "object" && value !== null && (value as ReadableSignal<unknown>).__slateSignal === true && typeof (value as ReadableSignal<unknown>).get === "function";
}

export function track<T>(run: () => T): { readonly value: T; readonly dependencies: readonly ReadableSignal<unknown>[] } {
  const dependencies = new Set<ReadableSignal<unknown>>();
  const previous = activeObserver;
  activeObserver = {
    run: () => undefined,
    dispose: () => undefined,
    dependencies,
    cleanups: new Set(),
    active: true
  };
  try {
    return { value: run(), dependencies: [...dependencies] };
  } finally {
    activeObserver = previous;
  }
}

function notify(subscribers: Set<Subscriber>): void {
  for (const subscriber of [...subscribers]) {
    if (batchDepth > 0) pendingSubscribers.add(subscriber);
    else subscriber();
  }
}

function trackDependency(value: ReadableSignal<unknown>): void {
  activeObserver?.dependencies.add(value);
}
