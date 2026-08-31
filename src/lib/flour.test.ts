import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BLEND,
  absorptionBonus,
  blendAdvice,
  flourTimeFactor,
  fractions,
  totalWholegrainPct,
  whitePct,
} from './flour'

describe('blend arithmetic', () => {
  it('treats white as the remainder', () => {
    expect(whitePct(DEFAULT_BLEND)).toBe(100)
    expect(whitePct({ wholemealPct: 20, ryePct: 5 })).toBe(75)
  })

  it('always produces fractions summing to one', () => {
    const blends = [
      { wholemealPct: 0, ryePct: 0 },
      { wholemealPct: 15, ryePct: 5 },
      { wholemealPct: 100, ryePct: 0 },
      { wholemealPct: 50, ryePct: 50 },
    ]
    for (const b of blends) {
      const f = fractions(b)
      expect(f.white + f.wholemeal + f.rye).toBeCloseTo(1, 10)
    }
  })

  /*
   * Two independent sliders can be dragged past 100% between them. Capping by
   * ratio keeps the blend meaningful instead of producing negative white.
   */
  it('caps rather than going negative when the sliders exceed 100%', () => {
    const f = fractions({ wholemealPct: 80, ryePct: 60 })
    expect(f.white).toBe(0)
    expect(f.white + f.wholemeal + f.rye).toBeCloseTo(1, 10)
    expect(whitePct({ wholemealPct: 80, ryePct: 60 })).toBe(0)
  })

  it('survives nonsense input', () => {
    for (const b of [
      { wholemealPct: NaN, ryePct: 10 },
      { wholemealPct: -20, ryePct: 10 },
    ]) {
      const f = fractions(b)
      expect(f.white + f.wholemeal + f.rye).toBeCloseTo(1, 10)
    }
  })

  it('reports total wholegrain', () => {
    expect(totalWholegrainPct(DEFAULT_BLEND)).toBe(0)
    expect(totalWholegrainPct({ wholemealPct: 15, ryePct: 10 })).toBe(25)
  })
})

describe('flourTimeFactor', () => {
  it('leaves an all-white dough alone', () => {
    expect(flourTimeFactor(DEFAULT_BLEND)).toBe(1)
  })

  it('makes wholegrain ferment faster, and rye faster still', () => {
    const white = flourTimeFactor(DEFAULT_BLEND)
    const wholemeal = flourTimeFactor({ wholemealPct: 100, ryePct: 0 })
    const rye = flourTimeFactor({ wholemealPct: 0, ryePct: 100 })
    expect(wholemeal).toBeLessThan(white)
    expect(rye).toBeLessThan(wholemeal)
  })

  it('puts a full wholewheat dough about a quarter quicker', () => {
    // 1/1.3 ≈ 0.77, i.e. roughly 23% off the clock.
    expect(flourTimeFactor({ wholemealPct: 100, ryePct: 0 })).toBeCloseTo(0.769, 3)
  })

  it('is monotonic in wholegrain content', () => {
    let previous = flourTimeFactor(DEFAULT_BLEND)
    for (let pct = 5; pct <= 100; pct += 5) {
      const next = flourTimeFactor({ wholemealPct: pct, ryePct: 0 })
      expect(next).toBeLessThanOrEqual(previous)
      previous = next
    }
  })

  it('blends proportionally', () => {
    const half = flourTimeFactor({ wholemealPct: 50, ryePct: 0 })
    // Rates average, so the time factor is 1/(0.5 + 0.5×1.3).
    expect(half).toBeCloseTo(1 / 1.15, 6)
  })
})

describe('absorptionBonus', () => {
  it('is nothing for white flour', () => {
    expect(absorptionBonus(DEFAULT_BLEND)).toBe(0)
  })

  it('asks for about ten more points at full wholemeal, more for rye', () => {
    expect(absorptionBonus({ wholemealPct: 100, ryePct: 0 })).toBeCloseTo(10, 6)
    expect(absorptionBonus({ wholemealPct: 0, ryePct: 100 })).toBeCloseTo(15, 6)
  })

  it('scales with the proportion', () => {
    expect(absorptionBonus({ wholemealPct: 20, ryePct: 0 })).toBeCloseTo(2, 6)
    expect(absorptionBonus({ wholemealPct: 15, ryePct: 10 })).toBeCloseTo(3, 6)
  })
})

describe('blendAdvice', () => {
  it('names each band', () => {
    const label = (wholemealPct: number, ryePct = 0) =>
      blendAdvice({ wholemealPct, ryePct }).label
    expect(label(0)).toBe('All white')
    expect(label(15)).toBe('Lightly seeded')
    expect(label(40)).toBe('Half and half')
    expect(label(80)).toBe('Mostly wholegrain')
    expect(label(10, 50)).toBe('Rye-heavy')
  })

  it('always returns a note', () => {
    for (let w = 0; w <= 100; w += 10) {
      expect(blendAdvice({ wholemealPct: w, ryePct: 0 }).note.length).toBeGreaterThan(0)
    }
  })
})
