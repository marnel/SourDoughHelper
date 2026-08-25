/**
 * The timer store.
 *
 * Timers are stored as an absolute `endsAt` timestamp, never as a countdown
 * that has to be decremented. That single decision is what makes a six-hour
 * bulk ferment survive the phone locking, the tab being evicted, the app being
 * force-quit and a browser restart — on reopening, the remaining time is just
 * `endsAt - now`, and anything that came due while away is reported as overdue
 * rather than silently lost.
 *
 * A single one-second tick drives every timer, which also means waking from
 * sleep needs no special handling: the next tick simply sees a much later
 * clock and catches up.
 */

import { KEYS, load, save } from './storage'
import { chime, showNotification, vibrate } from './notify'

export interface Timer {
  id: string
  label: string
  note?: string
  /** Full length of the timer in ms, kept so it can be restarted. */
  durationMs: number
  /** When it fires. Null while paused. */
  endsAt: number | null
  /** Time left at the moment it was paused. Null while running. */
  pausedMs: number | null
  createdAt: number
  /** Set once the alert has fired, so it fires exactly once. */
  alerted: boolean
  /** Set when the baker dismisses a finished timer. */
  dismissed: boolean
  /** Which schedule step this came from, if any. */
  stepKey?: string
  /**
   * 'bake' marks a timer armed from the schedule. Re-arming replaces only
   * these, so a timer you added by hand mid-bake survives.
   */
  source?: 'bake'
}

type Listener = () => void

let timers: Timer[] = load<Timer[]>(KEYS.timers, [])
if (!Array.isArray(timers)) timers = []

const listeners = new Set<Listener>()

function commit(next: Timer[]): void {
  timers = next
  save(KEYS.timers, timers)
  listeners.forEach((l) => l())
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getTimers(): Timer[] {
  return timers
}

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `t${Date.now()}${Math.floor(Math.random() * 1e6)}`

export interface NewTimer {
  label: string
  durationMs: number
  note?: string
  stepKey?: string
  source?: 'bake'
  /** Fire at a specific moment rather than `durationMs` from now. */
  endsAt?: number
}

export function addTimer(input: NewTimer): Timer {
  const now = Date.now()
  const timer: Timer = {
    id: newId(),
    label: input.label,
    note: input.note,
    durationMs: input.durationMs,
    endsAt: input.endsAt ?? now + input.durationMs,
    pausedMs: null,
    createdAt: now,
    alerted: false,
    dismissed: false,
    stepKey: input.stepKey,
    source: input.source,
  }
  commit([...timers, timer])
  return timer
}

/**
 * Swap in a fresh set of schedule timers, leaving anything the baker added by
 * hand untouched. Called every time a bake is armed or re-timed, so it has to
 * be non-destructive to ad-hoc timers.
 */
export function replaceBakeTimers(next: NewTimer[]): void {
  const now = Date.now()
  const kept = timers.filter((t) => t.source !== 'bake')
  commit([
    ...kept,
    ...next.map((input) => ({
      id: newId(),
      label: input.label,
      note: input.note,
      durationMs: input.durationMs,
      endsAt: input.endsAt ?? now + input.durationMs,
      pausedMs: null,
      createdAt: now,
      alerted: false,
      dismissed: false,
      stepKey: input.stepKey,
      source: 'bake' as const,
    })),
  ])
}

/** Drop every schedule timer, e.g. when a bake is abandoned. */
export function clearBakeTimers(): void {
  commit(timers.filter((t) => t.source !== 'bake'))
}

function update(id: string, patch: (t: Timer) => Timer): void {
  commit(timers.map((t) => (t.id === id ? patch(t) : t)))
}

export function removeTimer(id: string): void {
  commit(timers.filter((t) => t.id !== id))
}

export function clearAll(): void {
  commit([])
}

export function clearFinished(): void {
  const now = Date.now()
  commit(timers.filter((t) => !(t.endsAt !== null && t.endsAt <= now)))
}

export function pauseTimer(id: string): void {
  const now = Date.now()
  update(id, (t) =>
    t.endsAt === null
      ? t
      : { ...t, pausedMs: Math.max(0, t.endsAt - now), endsAt: null },
  )
}

export function resumeTimer(id: string): void {
  const now = Date.now()
  update(id, (t) =>
    t.pausedMs === null ? t : { ...t, endsAt: now + t.pausedMs, pausedMs: null },
  )
}

/** Push a timer out (or pull it in, with a negative value). */
export function adjustTimer(id: string, deltaMs: number): void {
  const now = Date.now()
  update(id, (t) => {
    if (t.endsAt === null) {
      return { ...t, pausedMs: Math.max(0, (t.pausedMs ?? 0) + deltaMs) }
    }
    // Extending an already-finished timer restarts it from now, which is what
    // "give the bulk another 30 minutes" means in practice.
    const base = Math.max(t.endsAt, now)
    return {
      ...t,
      endsAt: Math.max(now, base + deltaMs),
      alerted: false,
      dismissed: false,
    }
  })
}

export function restartTimer(id: string): void {
  const now = Date.now()
  update(id, (t) => ({
    ...t,
    endsAt: now + t.durationMs,
    pausedMs: null,
    alerted: false,
    dismissed: false,
  }))
}

export function dismissTimer(id: string): void {
  update(id, (t) => ({ ...t, dismissed: true }))
}

export const remaining = (t: Timer, now: number): number =>
  t.endsAt === null ? (t.pausedMs ?? 0) : t.endsAt - now

export const isRunning = (t: Timer, now: number): boolean =>
  t.endsAt !== null && t.endsAt > now

export const isFinished = (t: Timer, now: number): boolean =>
  t.endsAt !== null && t.endsAt <= now

export const isPaused = (t: Timer): boolean => t.endsAt === null

/** Progress 0–1, for the ring. */
export function progress(t: Timer, now: number): number {
  if (t.durationMs <= 0) return 1
  const left = remaining(t, now)
  return Math.min(1, Math.max(0, 1 - left / t.durationMs))
}

// --- The tick ------------------------------------------------------------

let interval: ReturnType<typeof setInterval> | null = null
let started = false

/**
 * Fires alerts for any timer that has come due. Called every second, on tab
 * focus, and on visibility change — the last two are what catch up after the
 * browser has throttled or frozen background timers.
 */
export function tick(): void {
  const now = Date.now()
  const due = timers.filter((t) => t.endsAt !== null && t.endsAt <= now && !t.alerted)
  if (due.length === 0) {
    // Still notify subscribers so countdowns re-render.
    listeners.forEach((l) => l())
    return
  }

  for (const t of due) {
    const late = now - (t.endsAt ?? now)
    const body =
      late > 90_000
        ? `Was due ${Math.round(late / 60_000)} minutes ago.`
        : (t.note ?? 'Timer finished.')
    void showNotification(t.label, body, t.id)
    vibrate()
    chime()
  }

  commit(
    timers.map((t) =>
      due.some((d) => d.id === t.id) ? { ...t, alerted: true } : t,
    ),
  )
}

export function startClock(): () => void {
  if (started) return () => {}
  started = true

  interval = setInterval(tick, 1000)
  const onVisible = () => {
    if (document.visibilityState === 'visible') tick()
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', tick)

  // Another tab may have changed the timers.
  const onStorage = (e: StorageEvent) => {
    if (e.key?.endsWith(KEYS.timers)) {
      timers = load<Timer[]>(KEYS.timers, [])
      listeners.forEach((l) => l())
    }
  }
  window.addEventListener('storage', onStorage)

  return () => {
    if (interval) clearInterval(interval)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', tick)
    window.removeEventListener('storage', onStorage)
    started = false
  }
}
