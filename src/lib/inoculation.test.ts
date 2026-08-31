import { describe, expect, it } from 'vitest'
import {
  REFERENCE_LEVAIN_PCT,
  inoculationShiftMin,
  levainAdvice,
} from './inoculation'

describe('inoculationShiftMin', () => {
  it('does not move the reference percentage', () => {
    expect(inoculationShiftMin(REFERENCE_LEVAIN_PCT)).toBe(0)
  })

  /*
   * The population model: halving the levain costs exactly one doubling,
   * whatever you halve from. A naive "double the levain, halve the time" rule
   * would instead predict a 2.5h bulk at 40%, which is badly wrong.
   */
  it('costs one generation per halving, wherever you start', () => {
    const perHalving = inoculationShiftMin(10) - inoculationShiftMin(20)
    expect(inoculationShiftMin(5) - inoculationShiftMin(10)).toBe(perHalving)
    expect(inoculationShiftMin(20) - inoculationShiftMin(40)).toBe(perHalving)
    expect(perHalving).toBe(90)
  })

  it('matches the timings bakers actually report', () => {
    // 20% ≈ 5h, so 10% ≈ 6.5h and 40% ≈ 3.5h.
    expect(inoculationShiftMin(10)).toBe(90)
    expect(inoculationShiftMin(40)).toBe(-90)
  })

  it('is monotonic — more levain is never slower', () => {
    for (let pct = 5; pct < 40; pct++) {
      expect(inoculationShiftMin(pct + 1)).toBeLessThanOrEqual(
        inoculationShiftMin(pct),
      )
    }
  })

  it('clamps and survives nonsense input', () => {
    expect(inoculationShiftMin(0.0001)).toBe(240)
    expect(inoculationShiftMin(100000)).toBe(-240)
    expect(inoculationShiftMin(0)).toBe(0)
    expect(inoculationShiftMin(-5)).toBe(0)
    expect(inoculationShiftMin(NaN)).toBe(0)
  })
})

describe('levainAdvice', () => {
  it('bands the slider’s range', () => {
    const label = (p: number) => levainAdvice(p).label
    expect(label(5)).toBe('Very small')
    expect(label(12)).toBe('Small')
    expect(label(20)).toBe('Standard')
    expect(label(30)).toBe('Large')
    expect(label(40)).toBe('Very large')
  })

  it('always returns a note', () => {
    for (let p = 1; p <= 60; p++) {
      expect(levainAdvice(p).note.length).toBeGreaterThan(0)
    }
  })
})
