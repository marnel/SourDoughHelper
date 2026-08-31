import { describe, expect, it } from 'vitest'
import {
  REFERENCE_C,
  cToF,
  fToC,
  fermentFactor,
  formatTemp,
  formatTempDelta,
  tempAdvice,
} from './temperature'

describe('fermentFactor', () => {
  it('is 1 at the reference temperature', () => {
    expect(fermentFactor(REFERENCE_C)).toBe(1)
  })

  it('doubles the time for every 10 °C colder', () => {
    expect(fermentFactor(14)).toBeCloseTo(2, 5)
    expect(fermentFactor(4)).toBeCloseTo(3.5, 5) // clamped from 4
  })

  it('halves the time for every 10 °C warmer', () => {
    expect(fermentFactor(34)).toBeCloseTo(0.5, 5)
  })

  it('clamps, so an absurd temperature cannot produce an absurd bulk', () => {
    expect(fermentFactor(-50)).toBe(3.5)
    expect(fermentFactor(200)).toBe(0.35)
  })

  it('is monotonic — warmer is never slower', () => {
    for (let t = 10; t < 40; t++) {
      expect(fermentFactor(t + 1)).toBeLessThanOrEqual(fermentFactor(t))
    }
  })
})

describe('unit conversion', () => {
  it('converts the fixed points', () => {
    expect(cToF(0)).toBe(32)
    expect(cToF(100)).toBe(212)
    expect(fToC(32)).toBe(0)
  })

  it('round-trips', () => {
    for (const c of [0, 18, 24, 37.5, 99]) {
      expect(fToC(cToF(c))).toBeCloseTo(c, 10)
    }
  })

  it('formats an absolute temperature in either unit', () => {
    expect(formatTemp(24, 'C')).toBe('24°C')
    expect(formatTemp(24, 'F')).toBe('75°F')
  })

  /*
   * A difference converts by ratio, not by the full formula. Getting this
   * wrong would render "doubles every 10°C warmer" as "every 50°F warmer".
   */
  it('formats a temperature difference by ratio', () => {
    expect(formatTempDelta(10, 'C')).toBe('10°C')
    expect(formatTempDelta(10, 'F')).toBe('18°F')
  })
})

describe('tempAdvice', () => {
  it('bands the range, inclusive of each lower bound', () => {
    const label = (t: number) => tempAdvice(t).label
    expect([label(10), label(17.9)]).toEqual(['Cold', 'Cold'])
    expect([label(18), label(21.9)]).toEqual(['Cool', 'Cool'])
    expect([label(22), label(25.9)]).toEqual(['Ideal', 'Ideal'])
    expect([label(26), label(28.9)]).toEqual(['Warm', 'Warm'])
    expect([label(29), label(40)]).toEqual(['Hot', 'Hot'])
  })

  it('always returns a note', () => {
    for (let t = -10; t <= 50; t += 3) {
      expect(tempAdvice(t).note.length).toBeGreaterThan(0)
    }
  })
})
