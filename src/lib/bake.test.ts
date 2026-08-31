import { describe, expect, it } from 'vitest'
import {
  adjustStep,
  alertMoment,
  bakeTimersFor,
  endStepNow,
  isAdjusted,
  isShiftableStep,
  needsTimer,
  startBake,
  totalDrift,
} from './bake'
import { DEFAULT_PLAN, buildSchedule, type ScheduledStep } from './schedule'

const T0 = new Date('2026-03-14T08:00:00Z')
const MIN = 60_000

const schedule = (adjustments = {}) =>
  buildSchedule({
    plan: DEFAULT_PLAN,
    ratioId: '1-2-2',
    tempC: 24,
    anchor: 'feed-starter',
    anchorAt: T0,
    adjustments,
  })

describe('adjustments', () => {
  it('starts clean', () => {
    const bake = startBake(T0.getTime())
    expect(bake.startedAt).toBe(T0.getTime())
    expect(totalDrift(bake)).toBe(0)
    expect(isAdjusted(bake)).toBe(false)
  })

  it('accumulates repeated nudges to the same step', () => {
    let bake = startBake(T0.getTime())
    bake = adjustStep(bake, 'bulk', 15)
    bake = adjustStep(bake, 'bulk', 15)
    bake = adjustStep(bake, 'bulk', 30)
    expect(bake.adjustments.bulk).toBe(60)
  })

  it('nets out opposing nudges', () => {
    let bake = startBake(T0.getTime())
    bake = adjustStep(bake, 'bulk', 30)
    bake = adjustStep(bake, 'bulk', -30)
    expect(totalDrift(bake)).toBe(0)
  })

  it('sums drift across steps', () => {
    let bake = startBake(T0.getTime())
    bake = adjustStep(bake, 'autolyse', -15)
    bake = adjustStep(bake, 'bulk', 60)
    expect(totalDrift(bake)).toBe(45)
    expect(isAdjusted(bake)).toBe(true)
  })

  it('does not mutate the bake it is given', () => {
    const before = startBake(T0.getTime())
    const after = adjustStep(before, 'bulk', 30)
    expect(before.adjustments).toEqual({})
    expect(after).not.toBe(before)
  })
})

describe('endStepNow', () => {
  it('records the unused time as a negative adjustment', () => {
    const bake = startBake(T0.getTime())
    const now = T0.getTime()
    const plannedEnd = now + 15 * MIN
    expect(endStepNow(bake, 'autolyse', plannedEnd, now).adjustments.autolyse).toBe(
      -15,
    )
  })

  it('records overrun as a positive one when the step is already late', () => {
    const bake = startBake(T0.getTime())
    const now = T0.getTime()
    const plannedEnd = now - 20 * MIN
    expect(endStepNow(bake, 'bulk', plannedEnd, now).adjustments.bulk).toBe(20)
  })

  it('composes with an earlier nudge on the same step', () => {
    let bake = startBake(T0.getTime())
    bake = adjustStep(bake, 'bulk', 60)
    const now = T0.getTime()
    bake = endStepNow(bake, 'bulk', now + 10 * MIN, now)
    expect(bake.adjustments.bulk).toBe(50)
  })
})

describe('which steps can be driven from a timer', () => {
  it('accepts steps that alert at their end', () => {
    expect(isShiftableStep('bulk')).toBe(true)
    expect(isShiftableStep('retard')).toBe(true)
  })

  /*
   * Folds and the preheat announce their *start*, so a timer's endsAt is not
   * the step's end and "done early" would compute a nonsense delta.
   */
  it('rejects start-alerting steps and missing keys', () => {
    expect(isShiftableStep('fold')).toBe(false)
    expect(isShiftableStep('preheat')).toBe(false)
    expect(isShiftableStep(undefined)).toBe(false)
  })
})

describe('alertMoment', () => {
  const s = schedule()
  const byKey = (k: string) => s.steps.find((x) => x.key === k)!

  it('alerts at the end of a wait', () => {
    expect(alertMoment(byKey('bulk'))).toBe(byKey('bulk').end)
  })

  it('alerts at the start of a fold and the preheat', () => {
    expect(alertMoment(byKey('fold'))).toBe(byKey('fold').start)
    expect(alertMoment(byKey('preheat'))).toBe(byKey('preheat').start)
  })
})

describe('needsTimer', () => {
  const s = schedule()
  const byKey = (k: string) => s.steps.find((x) => x.key === k)!

  it('times waits and folds', () => {
    expect(needsTimer(byKey('bulk'))).toBe(true)
    expect(needsTimer(byKey('fold'))).toBe(true)
  })

  /*
   * Hands-on steps are named in the previous alert's note. Giving them a timer
   * produced a duplicate firing at the same moment as the step that mattered.
   */
  it('skips hands-on steps', () => {
    for (const key of ['mix', 'preshape', 'shape']) {
      expect(needsTimer(byKey(key))).toBe(false)
    }
  })
})

describe('bakeTimersFor', () => {
  const s = schedule()
  const from = s.steps[0]!.start
  const timers = bakeTimersFor(s, from)

  it('tags every timer as belonging to the bake', () => {
    expect(timers.length).toBeGreaterThan(0)
    expect(timers.every((t) => t.source === 'bake')).toBe(true)
    expect(timers.every((t) => t.stepKey !== undefined)).toBe(true)
  })

  /*
   * Regression: labels used to carry a "— done" suffix, so a timer with half
   * an hour left announced itself as already finished.
   */
  it('labels timers with what is happening, not with "done"', () => {
    expect(timers.some((t) => /— done/.test(t.label))).toBe(false)
    expect(timers.map((t) => t.label)).toContain('Autolyse')
  })

  it('points each wait at the next thing to do', () => {
    const autolyse = timers.find((t) => t.label === 'Autolyse')!
    expect(autolyse.note).toBe('Next: Add levain and salt.')
  })

  it('tells you when there is nothing after', () => {
    const cool = timers.find((t) => t.stepKey === 'cool')!
    expect(cool.note).toMatch(/last step/i)
  })

  it('omits anything already past', () => {
    const midway = s.steps.find((x) => x.key === 'bulk')!.end
    const later = bakeTimersFor(s, midway)
    expect(later.length).toBeLessThan(timers.length)
    expect(later.every((t) => (t.endsAt ?? 0) > midway)).toBe(true)
    expect(later.some((t) => t.stepKey === 'autolyse')).toBe(false)
  })

  it('sets each timer to fire at its alert moment', () => {
    for (const t of timers) {
      const step = s.steps.find(
        (x): x is ScheduledStep => alertMoment(x) === t.endsAt,
      )
      expect(step).toBeDefined()
    }
  })

  it('never produces a zero or negative duration', () => {
    const nearEnd = s.steps.at(-1)!.end - 1000
    for (const t of bakeTimersFor(s, nearEnd)) {
      expect(t.durationMs).toBeGreaterThan(0)
    }
  })
})
