import { signal } from "./reactive.js";

export { batch, computed, effect, isSignal, readReactive, signal, untracked } from "./reactive.js";
export type { ReactiveValue, StateAction, Subscriber } from "./reactive.js";

export type SetStateAction<S> = S | ((previous: S) => S);
export type Dispatch<A> = (action: A) => void;
export type Reducer<S, A> = (state: S, action: A) => S;
export type EffectCallback = () => void | (() => void);

export interface SlateStore<S> {
  readonly getState: () => S;
  readonly get: () => S;
  readonly setState: Dispatch<SetStateAction<S>>;
  readonly set: Dispatch<SetStateAction<S>>;
  readonly update: Dispatch<SetStateAction<S>>;
  readonly subscribe: (listener: () => void) => () => void;
}

export type SlateSignal<S> = import("./types.js").WritableSignal<S>;

export function createSlateSignal<S>(initial: S): SlateSignal<S> {
  return signal(initial);
}

export interface SlateHookRuntime {
  readonly useState: <S>(initial: S | (() => S)) => readonly [S, Dispatch<SetStateAction<S>>];
  readonly useReducer?: <S, A>(reducer: Reducer<S, A>, initial: S) => readonly [S, Dispatch<A>];
  readonly useEffect?: (effect: EffectCallback, dependencies?: readonly unknown[]) => void;
  readonly useMemo?: <S>(factory: () => S, dependencies: readonly unknown[]) => S;
  readonly useCallback?: <F extends (...args: never[]) => unknown>(callback: F, dependencies: readonly unknown[]) => F;
  readonly useRef?: <S>(initial: S) => { current: S };
  readonly useSyncExternalStore?: <S>(subscribe: (listener: () => void) => () => void, getSnapshot: () => S, getServerSnapshot?: () => S) => S;
}

export interface SlateHooks extends SlateHookRuntime {
  readonly useSlateState: <S>(initial: S | (() => S)) => readonly [S, Dispatch<SetStateAction<S>>];
  readonly useSlateStore: <S>(store: SlateStore<S>) => S;
}

export function createSlateStore<S>(initial: S | (() => S)): SlateStore<S> {
  let state = typeof initial === "function" ? (initial as () => S)() : initial;
  const listeners = new Set<() => void>();
  const setState: Dispatch<SetStateAction<S>> = action => {
    const next = typeof action === "function" ? (action as (previous: S) => S)(state) : action;
    if (Object.is(state, next)) return;
    state = next;
    for (const listener of [...listeners]) listener();
  };
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  return { getState: () => state, get: () => state, setState, set: setState, update: setState, subscribe };
}

export function createReducerStore<S, A>(initial: S, reducer: Reducer<S, A>): SlateStore<S> & { readonly dispatch: Dispatch<A> } {
  const store = createSlateStore(initial);
  return { ...store, dispatch: action => store.setState(state => reducer(state, action)) };
}

export function useSlateState<S>(runtime: SlateHookRuntime, initial: S | (() => S)): readonly [S, Dispatch<SetStateAction<S>>] {
  return runtime.useState(initial);
}

export function useSlateStore<S>(runtime: SlateHookRuntime, store: SlateStore<S>): S {
  if (runtime.useSyncExternalStore) return runtime.useSyncExternalStore(store.subscribe, store.getState, store.getState);
  if (!runtime.useEffect) throw new Error("SlateHookRuntime precisa de useSyncExternalStore ou useEffect");
  const [snapshot, setSnapshot] = runtime.useState(store.getState);
  runtime.useEffect(() => store.subscribe(() => setSnapshot(store.getState())), [store]);
  return snapshot;
}

export function createSlateHooks(runtime: SlateHookRuntime): SlateHooks {
  return {
    ...runtime,
    useSlateState: initial => useSlateState(runtime, initial),
    useSlateStore: store => useSlateStore(runtime, store)
  };
}
