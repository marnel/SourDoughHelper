/**
 * Tiny persistence layer.
 *
 * Everything the app knows lives in localStorage under a namespaced key.
 * Reads are defensive: a corrupt or stale value falls back to the default
 * rather than white-screening the app, and partial objects are merged over the
 * default so adding a field in a later version does not break saved state.
 */

const PREFIX = 'sdhelper:v1:'

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw == null) return fallback
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      fallback &&
      typeof fallback === 'object' &&
      !Array.isArray(fallback)
    ) {
      return { ...(fallback as object), ...(parsed as object) } as T
    }
    return (parsed as T) ?? fallback
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Private mode or a full quota — the app still works, just forgetfully.
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* ignore */
  }
}

export const KEYS = {
  plan: 'plan',
  recipe: 'recipe',
  timers: 'timers',
  starter: 'starter',
  prefs: 'prefs',
  feedLog: 'feed-log',
  anchor: 'anchor',
} as const
