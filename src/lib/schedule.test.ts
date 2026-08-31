import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PLAN,
  buildSchedule,
  currentStep,
  nextAction,
  type PlanInput,
  type ScheduleRequest,
  type StepKey,
} from './schedule'

const T0 = new Date('2026-03-14T08:00:00Z')
const MIN = 60_000

function build(over: Partial<ScheduleRequest> = {}, plan: Partial<PlanInput> = {}) {
  return buildSchedule({
    plan: { ...DEFAULT_PLAN, ...plan },
    ratioId: '1-2-2',
    tempC: 24,
    anchor: 'feed-starter',
    anchorAt: T0,
    ...over,
  })
}

const step = (s: ReturnType<typeof build>, key: StepKey) => {
  const found = s.steps.find((x) => x.key === key)
  if (!found) throw new Error(`no ${key} step`)
  return found
}
const has = (s: ReturnType<typeof build>, key: StepKey) =>
  s.steps.some((x) => x.key === key)

describe('chain layout', () => {
  it('runs steps back to back with no gaps or overlaps', () => {
    const s = build()
    const chain = s.steps.filter((x) => x.key !== 'fold' && x.key !== 'preheat')
    for (let i = 1; i < chain.length; i++) {
      expect(chain[i]!.start).toBe(chain[i - 1]!.end)
    }
  })

  it('orders steps by start time', () => {
    const s = build()
    for (let i = 1; i < s.steps.length; i++) {
      expect(s.steps[i]!.start).toBeGreaterThanOrEqual(s.steps[i - 1]!.start)
    }
  })

  /*
   * The preheat runs during the tail of the retard so the oven is hot the
   * moment the dough leaves the fridge. Lengthening it must not push the bake.
   */
  it('overlaps the preheat with the step before it', () => {
    const s = build()
    expect(step(s, 'preheat').end).toBe(step(s, 'retard').end)
    expect(step(s, 'preheat').start).toBe(
      step(s, 'retard').end - DEFAULT_PLAN.preheatMin * MIN,
    )
  })

  it('does not lengthen the plan when the preheat gets longer', () => {
    const short = build({}, { preheatMin: 30 })
    const long = build({}, { preheatMin: 90 })
    expect(long.totalMs).toBe(short.totalMs)
    expect(step(long, 'bakeLidOff').end).toBe(step(short, 'bakeLidOff').end)
  })

  it('omits the levain build when the starter is already ready', () => {
    const s = build({}, { includeLevainBuild: false })
    expect(has(s, 'levain')).toBe(false)
    expect(s.steps[0]!.key).toBe('autolyse')
  })
})

describe('anchoring', () => {
  it('starts at the anchor when planning forward from a feed', () => {
    expect(build().steps[0]!.start).toBe(T0.getTime())
  })

  it('lands the levain peak on the anchor', () => {
    const s = build({ anchor: 'starter-ready' })
    expect(step(s, 'levain').end).toBe(T0.getTime())
  })

  it('lands the end of the bake on the anchor', () => {
    const s = build({ anchor: 'out-of-oven' })
    expect(step(s, 'bakeLidOff').end).toBe(T0.getTime())
  })

  it('lands the end of cooling on the anchor', () => {
    const s = build({ anchor: 'ready-to-eat' })
    expect(step(s, 'cool').end).toBe(T0.getTime())
  })

  it('produces an identical shape whichever end you anchor from', () => {
    const forward = build({ anchor: 'feed-starter' })
    const backward = build({ anchor: 'out-of-oven' })
    expect(backward.totalMs).toBe(forward.totalMs)
    expect(backward.steps.map((s) => s.key)).toEqual(
      forward.steps.map((s) => s.key),
    )
    // Same chain, just slid along the clock.
    const shift = backward.steps[0]!.start - forward.steps[0]!.start
    backward.steps.forEach((s, i) => {
      expect(s.start - shift).toBe(forward.steps[i]!.start)
    })
  })
})

describe('temperature scaling', () => {
  it('stretches fermentation in a cold kitchen and not the oven', () => {
    const warm = build({ tempC: 24 })
    const cold = build({ tempC: 14 })
    expect(step(cold, 'bulk').durationMin).toBe(step(warm, 'bulk').durationMin * 2)
    expect(step(cold, 'levain').durationMin).toBe(
      step(warm, 'levain').durationMin * 2,
    )
    // Ovens, fridges and cooling racks do not care about the kitchen.
    for (const key of ['bakeLidOn', 'bakeLidOff', 'cool', 'retard'] as StepKey[]) {
      expect(step(cold, key).durationMin).toBe(step(warm, key).durationMin)
    }
  })

  it('marks which steps the temperature moved', () => {
    const cold = build({ tempC: 14 })
    expect(step(cold, 'bulk').tempAdjusted).toBe(true)
    expect(step(cold, 'cool').tempAdjusted).toBe(false)
    expect(step(build({ tempC: 24 }), 'bulk').tempAdjusted).toBe(false)
  })

  it('scales the room-temperature final proof but not the cold retard', () => {
    const cold = build({ tempC: 14 }, { retardHours: 0 })
    const warm = build({ tempC: 24 }, { retardHours: 0 })
    expect(step(cold, 'proof').durationMin).toBe(
      step(warm, 'proof').durationMin * 2,
    )
  })
})

describe('same-day bake', () => {
  /*
   * Regression: setting the retard to zero used to delete the proof outright,
   * producing a schedule that went from shaping straight into the oven.
   */
  it('swaps the cold retard for a room-temperature final proof', () => {
    const s = build({}, { retardHours: 0 })
    expect(has(s, 'retard')).toBe(false)
    expect(has(s, 'proof')).toBe(true)
    expect(step(s, 'proof').durationMin).toBe(DEFAULT_PLAN.finalProofHours * 60)
  })

  it('always proofs after shaping, whichever route', () => {
    for (const retardHours of [0, 1, 14, 48]) {
      const s = build({}, { retardHours })
      const proof = s.steps.find((x) => x.key === 'proof' || x.key === 'retard')
      expect(proof).toBeDefined()
      expect(proof!.start).toBeGreaterThanOrEqual(step(s, 'shape').end)
      expect(proof!.end).toBeLessThanOrEqual(step(s, 'bakeLidOn').start)
    }
  })
})

describe('stretch and folds', () => {
  it('spaces sets from the start of bulk', () => {
    const s = build()
    const folds = s.steps.filter((x) => x.key === 'fold')
    expect(folds).toHaveLength(DEFAULT_PLAN.foldSets)
    folds.forEach((f, i) => {
      expect(f.start).toBe(
        step(s, 'bulk').start + DEFAULT_PLAN.foldIntervalMin * (i + 1) * MIN,
      )
    })
  })

  it('generates none when turned off', () => {
    expect(build({}, { foldSets: 0 }).steps.some((s) => s.key === 'fold')).toBe(
      false,
    )
  })

  it('stretches the interval with temperature so folds stay inside bulk', () => {
    const cold = build({ tempC: 14 })
    const folds = cold.steps.filter((x) => x.key === 'fold')
    expect(folds.at(-1)!.start).toBeLessThan(step(cold, 'bulk').end)
  })

  // Regression: fold sets used to be able to run past the end of bulk.
  it('warns when the sets would overrun bulk', () => {
    const s = build({}, { foldSets: 8, foldIntervalMin: 90, bulkHours: 2 })
    expect(s.warnings.join(' ')).toMatch(/run past the end of bulk/i)
  })

  it('warns when folding drags into the last third of bulk', () => {
    const s = build({}, { foldSets: 4, foldIntervalMin: 50, bulkHours: 4 })
    expect(s.warnings.join(' ')).toMatch(/last third/i)
  })

  it('says nothing about a sensible fold schedule', () => {
    expect(build().warnings).toEqual([])
  })
})

describe('mid-bake adjustments', () => {
  it('lengthens the step and pushes everything after it', () => {
    const base = build()
    const late = build({ adjustments: { bulk: 60 } })
    expect(step(late, 'bulk').durationMin).toBe(step(base, 'bulk').durationMin + 60)
    expect(step(late, 'bakeLidOff').end).toBe(step(base, 'bakeLidOff').end + 60 * MIN)
  })

  it('leaves earlier steps untouched', () => {
    const base = build()
    const late = build({ adjustments: { bulk: 60 } })
    for (const key of ['levain', 'autolyse', 'mix'] as StepKey[]) {
      expect(step(late, key).start).toBe(step(base, key).start)
      expect(step(late, key).end).toBe(step(base, key).end)
    }
  })

  it('pulls the day forward when a step finishes early', () => {
    const base = build()
    const early = build({ adjustments: { autolyse: -15 } })
    expect(step(early, 'bakeLidOff').end).toBe(step(base, 'bakeLidOff').end - 15 * MIN)
  })

  it('never produces a negative duration', () => {
    const s = build({ adjustments: { bulk: -9999 } })
    expect(step(s, 'bulk').durationMin).toBe(0)
    expect(step(s, 'bulk').end).toBeGreaterThanOrEqual(step(s, 'bulk').start)
  })

  it('accumulates across several steps', () => {
    const base = build()
    const s = build({ adjustments: { autolyse: -15, bulk: 60, bench: 10 } })
    expect(step(s, 'cool').end).toBe(step(base, 'cool').end + 55 * MIN)
  })

  it('records the adjustment on the step for display', () => {
    const s = build({ adjustments: { bulk: 30 } })
    expect(step(s, 'bulk').adjustedMin).toBe(30)
    expect(step(s, 'cool').adjustedMin).toBe(0)
  })

  /*
   * The bug that motivated pinning a bake: on a backward-anchored plan,
   * extending bulk held the bake time fixed and slid the *start* earlier.
   * A running bake is anchored forward, so the finish is what moves.
   */
  it('moves the finish, not the start, for a bake anchored to its start', () => {
    const base = build({ anchor: 'feed-starter' })
    const late = build({ anchor: 'feed-starter', adjustments: { bulk: 60 } })
    expect(late.steps[0]!.start).toBe(base.steps[0]!.start)
    expect(step(late, 'bakeLidOff').end).toBeGreaterThan(
      step(base, 'bakeLidOff').end,
    )
  })

  it('conversely slides the start when planning backward — hence the pin', () => {
    const base = build({ anchor: 'out-of-oven' })
    const late = build({ anchor: 'out-of-oven', adjustments: { bulk: 60 } })
    expect(step(late, 'bakeLidOff').end).toBe(step(base, 'bakeLidOff').end)
    expect(late.steps[0]!.start).toBe(base.steps[0]!.start - 60 * MIN)
  })
})

describe('ratio drives the levain build', () => {
  it('gives a bigger feed a longer build and a later finish', () => {
    const fast = build({ ratioId: '1-1-1' })
    const slow = build({ ratioId: '1-10-10' })
    expect(step(fast, 'levain').durationMin).toBe(4 * 60)
    expect(step(slow, 'levain').durationMin).toBe(14 * 60)
    expect(slow.totalMs - fast.totalMs).toBe(10 * 60 * MIN)
  })

  it('names the ratio in the step title', () => {
    expect(step(build({ ratioId: '1-5-5' }), 'levain').title).toContain('1:5:5')
  })
})

describe('currentStep / nextAction', () => {
  const s = build()

  it('finds the step spanning a moment, ignoring folds', () => {
    const bulk = step(s, 'bulk')
    expect(currentStep(s, bulk.start + MIN)?.key).toBe('bulk')
    expect(currentStep(s, bulk.end - MIN)?.key).toBe('bulk')
  })

  it('has no current step before the start or after the end', () => {
    expect(currentStep(s, s.steps[0]!.start - MIN)).toBeUndefined()
    expect(currentStep(s, step(s, 'cool').end + MIN)).toBeUndefined()
  })

  it('finds the next thing to do', () => {
    expect(nextAction(s, s.steps[0]!.start)?.key).toBe('autolyse')
    expect(nextAction(s, step(s, 'cool').end)).toBeUndefined()
  })
})
