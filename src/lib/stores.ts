/**
 * Minimal shared stores.
 *
 * `usePersisted` is fine for state one page owns, but two components calling it
 * with the same key get two independent copies of that state — they both write
 * to localStorage and neither hears the other. That is precisely what caused
 * the feeding-ratio and kitchen-temperature bugs, where two tabs quietly
 * disagreed about the same value.
 *
 * So anything read or written from more than one place lives in a store
 * instead. Same shape as the timers and prefs stores: subscribe, get, set.
 */

import { load, save } from './storage'

export interface Store<T> {
  get: () => T
  set: (next: T | ((prev: T) => T)) => void
  subscribe: (listener: () => void) => () => void
}

export function createStore<T>(key: string, initial: T): Store<T> {
  let value = load<T>(key, initial)
  const listeners = new Set<() => void>()

  return {
    get: () => value,
    set: (next) => {
      value =
        typeof next === 'function' ? (next as (prev: T) => T)(value) : next
      save(key, value)
      listeners.forEach((l) => l())
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
