/**
 * Pass counter for measurement memoization.
 *
 * Layout asks for the same node's size several times in one pass, and the
 * renderer asks for the same widget's text again while painting. Caching those
 * answers is only safe while nothing can change underneath, so every cache
 * entry is stamped with the pass that produced it and a new pass invalidates
 * all of them at once. A signal that changes between passes therefore cannot
 * be served from a stale entry.
 */

let pass = 0;

/** Starts a new measurement pass and returns its identifier. */
export function beginMeasurePass(): number {
  pass += 1;
  return pass;
}

export function currentMeasurePass(): number {
  return pass;
}
