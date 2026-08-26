import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react'
import { load, save } from './lib/storage'
import { getTimers, subscribe, type Timer } from './lib/timers'
import {
  getPrefs,
  subscribe as subscribePrefs,
  type Prefs,
} from './lib/prefs'

/** A clock that re-renders on an interval. Default 1s, for countdowns. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    const sync = () => setNow(Date.now())
    document.addEventListener('visibilitychange', sync)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [intervalMs])
  return now
}

/** State that survives a reload. */
export function usePersisted<T>(
  key: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => load(key, initial))
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved =
          typeof next === 'function' ? (next as (p: T) => T)(prev) : next
        save(key, resolved)
        return resolved
      })
    },
    [key],
  )
  return [value, set]
}

export function useTimers(): Timer[] {
  return useSyncExternalStore(subscribe, getTimers, getTimers)
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribePrefs, getPrefs, getPrefs)
}

/**
 * Hash-based routing. Deliberately hand-rolled — it is twenty lines, it keeps
 * the Android back button working the way people expect inside an installed
 * app, and it avoids a router dependency in a four-page app.
 */
export type Route = 'starter' | 'method' | 'plan' | 'timers'

const ROUTES: Route[] = ['starter', 'method', 'plan', 'timers']

function readHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '')
  return (ROUTES as string[]).includes(raw) ? (raw as Route) : 'plan'
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(readHash)
  useEffect(() => {
    const onHash = () => setRoute(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const navigate = useCallback((r: Route) => {
    window.location.hash = `#/${r}`
  }, [])
  return [route, navigate]
}

/** Tracks a media query, for the reduced-motion and install-state checks. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}
