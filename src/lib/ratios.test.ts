import { describe, expect, it } from 'vitest'
import {
  RATIOS,
  feedFromStarter,
  feedFromTotal,
  getRatio,
  levainComposition,
} from './ratios'

describe('feed calculations', () => {
  it('scales a feed up from the starter in the jar', () => {
    const feed = feedFromStarter(getRatio('1-2-2'), 20)
    expect(feed).toMatchObject({ starter: 20, flour: 40, water: 40, total: 100 })
  })

  it('works back from the levain you need', () => {
    const feed = feedFromTotal(getRatio('1-2-2'), 200)
    expect(feed).toMatchObject({ starter: 40, flour: 80, water: 80, total: 200 })
  })

  it('is self-inverse', () => {
    for (const ratio of RATIOS) {
      const forward = feedFromStarter(ratio, 25)
      const back = feedFromTotal(ratio, forward.total)
      expect(back.starter).toBeCloseTo(25, 6)
    }
  })

  it('keeps a stiff feed at half the water of the flour', () => {
    const feed = feedFromStarter(getRatio('stiff-1-2-1'), 30)
    expect(feed.flour).toBe(60)
    expect(feed.water).toBe(30)
  })

  it('always totals its parts', () => {
    for (const ratio of RATIOS) {
      const feed = feedFromStarter(ratio, 15)
      expect(feed.starter + feed.flour + feed.water).toBeCloseTo(feed.total, 6)
    }
  })
})

describe('levainComposition', () => {
  it('splits a 100% levain evenly', () => {
    expect(levainComposition(getRatio('1-2-2'), 200)).toEqual({
      flour: 100,
      water: 100,
    })
  })

  it('gives a stiff levain two parts flour to one of water', () => {
    const { flour, water } = levainComposition(getRatio('stiff-1-2-1'), 150)
    expect(flour).toBeCloseTo(100, 6)
    expect(water).toBeCloseTo(50, 6)
  })

  it('conserves weight', () => {
    for (const ratio of RATIOS) {
      const { flour, water } = levainComposition(ratio, 237)
      expect(flour + water).toBeCloseTo(237, 6)
    }
  })
})

describe('the ratio table', () => {
  it('falls back rather than throwing on an unknown id', () => {
    expect(getRatio('nonsense').id).toBe('1-2-2')
  })

  it('has unique ids and complete guidance', () => {
    expect(new Set(RATIOS.map((r) => r.id)).size).toBe(RATIOS.length)
    for (const r of RATIOS) {
      expect(r.goodFor.length).toBeGreaterThan(0)
      expect(r.watchOut.length).toBeGreaterThan(0)
      expect(r.peakHoursAt24C).toBeGreaterThan(0)
    }
  })

  /*
   * A bigger meal takes longer to consume. If this ever inverts, the schedule
   * would quietly recommend the wrong ratio to hit a deadline.
   */
  it('peaks later the more the starter is diluted', () => {
    const hydrated = RATIOS.filter((r) => r.hydrationPct === 100).sort(
      (a, b) => a.flour / a.starter - b.flour / b.starter,
    )
    for (let i = 1; i < hydrated.length; i++) {
      expect(hydrated[i]!.peakHoursAt24C).toBeGreaterThan(
        hydrated[i - 1]!.peakHoursAt24C,
      )
    }
  })
})
