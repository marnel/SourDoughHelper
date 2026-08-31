import { describe, expect, it, vi } from 'vitest'
import { createStore } from './stores'

describe('createStore', () => {
  it('starts at the initial value when nothing is stored', () => {
    expect(createStore('t-init', { a: 1 }).get()).toEqual({ a: 1 })
  })

  it('sets a value directly or with an updater', () => {
    const store = createStore('t-set', 0)
    store.set(5)
    expect(store.get()).toBe(5)
    store.set((n) => n + 3)
    expect(store.get()).toBe(8)
  })

  it('notifies every subscriber on change', () => {
    const store = createStore('t-notify', 0)
    const a = vi.fn()
    const b = vi.fn()
    store.subscribe(a)
    store.subscribe(b)
    store.set(1)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('stops notifying after unsubscribe', () => {
    const store = createStore('t-unsub', 0)
    const listener = vi.fn()
    const off = store.subscribe(listener)
    store.set(1)
    off()
    store.set(2)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  /*
   * The whole point of a store over usePersisted: two readers see one value.
   * Two usePersisted calls on the same key gave two copies that never synced,
   * which is what let the feeding ratio and kitchen temperature disagree
   * between tabs.
   */
  it('gives every reader the same value', () => {
    const store = createStore('t-shared', 'a')
    let seenByOther = ''
    store.subscribe(() => {
      seenByOther = store.get()
    })
    store.set('b')
    expect(seenByOther).toBe('b')
    expect(store.get()).toBe('b')
  })

  it('survives storage being unavailable', () => {
    // No localStorage in the node environment; the store must still work.
    const store = createStore('t-nostorage', { ok: true })
    expect(() => store.set({ ok: false })).not.toThrow()
    expect(store.get()).toEqual({ ok: false })
  })
})
