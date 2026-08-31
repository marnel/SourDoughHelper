import { beforeEach, describe, expect, it } from 'vitest'
import {
  addTimer,
  adjustTimer,
  clearBakeTimers,
  clearFinished,
  clearAll,
  getTimers,
  isFinished,
  isPaused,
  pauseTimer,
  progress,
  remaining,
  replaceBakeTimers,
  restartTimer,
  resumeTimer,
} from './timers'

const MIN = 60_000
const NOW = Date.UTC(2026, 2, 14, 8, 0, 0)

beforeEach(() => {
  clearAll()
})

describe('timers are absolute, not counted down', () => {
  it('reports time left against the wall clock', () => {
    const t = addTimer({ label: 'Bulk', durationMs: 60 * MIN })
    expect(remaining(t, t.endsAt! - 20 * MIN)).toBe(20 * MIN)
  })

  /*
   * The whole reason for storing endsAt: a six-hour bulk has to survive the
   * phone being locked, the tab evicted and the browser restarted. Jumping the
   * clock forward stands in for all of that.
   */
  it('reports a timer that came due while the app was closed as overdue', () => {
    const t = addTimer({ label: 'Cold retard', durationMs: 14 * 60 * MIN })
    const muchLater = t.endsAt! + 90 * MIN
    expect(isFinished(t, muchLater)).toBe(true)
    expect(remaining(t, muchLater)).toBe(-90 * MIN)
  })

  it('can be pinned to a specific moment rather than a duration', () => {
    const at = NOW + 3 * 60 * MIN
    const t = addTimer({ label: 'Bake', durationMs: 1, endsAt: at })
    expect(t.endsAt).toBe(at)
  })
})

describe('progress', () => {
  it('runs from 0 to 1 and clamps', () => {
    const t = addTimer({ label: 'x', durationMs: 100 * MIN })
    expect(progress(t, t.endsAt! - 100 * MIN)).toBeCloseTo(0, 6)
    expect(progress(t, t.endsAt! - 50 * MIN)).toBeCloseTo(0.5, 6)
    expect(progress(t, t.endsAt!)).toBe(1)
    expect(progress(t, t.endsAt! + 10 * MIN)).toBe(1)
  })

  it('treats a zero-length timer as complete', () => {
    const t = addTimer({ label: 'x', durationMs: 0 })
    expect(progress(t, Date.now())).toBe(1)
  })
})

describe('pause and resume', () => {
  it('holds the remaining time while paused', () => {
    const t = addTimer({ label: 'x', durationMs: 30 * MIN })
    pauseTimer(t.id)
    const paused = getTimers()[0]!
    expect(isPaused(paused)).toBe(true)
    expect(paused.endsAt).toBeNull()
    expect(paused.pausedMs).toBeGreaterThan(29 * MIN)

    resumeTimer(paused.id)
    const running = getTimers()[0]!
    expect(isPaused(running)).toBe(false)
    expect(running.endsAt).not.toBeNull()
  })

  it('restart puts the full duration back', () => {
    const t = addTimer({ label: 'x', durationMs: 45 * MIN })
    adjustTimer(t.id, -40 * MIN)
    restartTimer(t.id)
    const after = getTimers()[0]!
    expect(remaining(after, Date.now())).toBeGreaterThan(44 * MIN)
    expect(after.alerted).toBe(false)
  })
})

describe('adjustTimer', () => {
  it('extends a finished timer from now, not from its old end', () => {
    // Fired an hour ago; "+15m" should mean fifteen minutes from now.
    const t = addTimer({
      label: 'Bulk',
      durationMs: 1,
      endsAt: Date.now() - 60 * MIN,
    })
    adjustTimer(t.id, 15 * MIN)
    const after = getTimers()[0]!
    expect(remaining(after, Date.now())).toBeGreaterThan(14 * MIN)
    expect(after.alerted).toBe(false)
  })

  it('clamps to fire immediately rather than winding into the past', () => {
    const t = addTimer({ label: 'x', durationMs: 5 * MIN })
    const before = Date.now()
    adjustTimer(t.id, -60 * MIN)
    // Lands on "now", not an hour ago — so it comes due at once and no more.
    const endsAt = getTimers()[0]!.endsAt!
    expect(endsAt).toBeGreaterThanOrEqual(before)
    expect(endsAt).toBeLessThanOrEqual(Date.now())
  })
})

describe('bake timers are separate from your own', () => {
  /*
   * Adjusting a running bake re-arms its timers on every change, so that must
   * never take out a timer the baker added by hand mid-bake.
   */
  it('replaces only bake timers and keeps manual ones', () => {
    addTimer({ label: 'Warm the banneton', durationMs: 30 * MIN })
    replaceBakeTimers([
      { label: 'Bulk', durationMs: 5 * MIN, stepKey: 'bulk' },
      { label: 'Bench rest', durationMs: 25 * MIN, stepKey: 'bench' },
    ])
    expect(getTimers()).toHaveLength(3)

    replaceBakeTimers([{ label: 'Bulk', durationMs: 90 * MIN, stepKey: 'bulk' }])
    const labels = getTimers().map((t) => t.label)
    expect(labels).toContain('Warm the banneton')
    expect(labels).toContain('Bulk')
    expect(labels).not.toContain('Bench rest')
    expect(getTimers().filter((t) => t.source === 'bake')).toHaveLength(1)
  })

  it('clears bake timers without touching manual ones', () => {
    addTimer({ label: 'Mine', durationMs: 10 * MIN })
    replaceBakeTimers([{ label: 'Bulk', durationMs: 5 * MIN, stepKey: 'bulk' }])
    clearBakeTimers()
    expect(getTimers().map((t) => t.label)).toEqual(['Mine'])
  })

  it('tags replacements as bake timers', () => {
    replaceBakeTimers([{ label: 'Bulk', durationMs: 5 * MIN, stepKey: 'bulk' }])
    expect(getTimers()[0]!.source).toBe('bake')
  })
})

describe('clearFinished', () => {
  it('removes only what has already fired', () => {
    addTimer({ label: 'past', durationMs: 1, endsAt: Date.now() - MIN })
    addTimer({ label: 'future', durationMs: 60 * MIN })
    clearFinished()
    expect(getTimers().map((t) => t.label)).toEqual(['future'])
  })
})
