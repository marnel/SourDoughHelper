import { describe, expect, it } from 'vitest'
import { DEFAULT_RECIPE, computeRecipe, grams, pct, perLoaf } from './recipe'

const at = (r: ReturnType<typeof computeRecipe>, name: string) => {
  const line = r.lines.find((l) => l.name.startsWith(name))
  if (!line) throw new Error(`no line starting with ${name}`)
  return line
}

describe('computeRecipe', () => {
  /*
   * The worked example from the README. Baker's percentages are relative to
   * *total* flour including the levain's, which is why you weigh out less
   * flour and less water than the headline numbers.
   */
  it('subtracts the levain’s own flour and water from what you add', () => {
    const r = computeRecipe(
      { totalFlour: 1000, hydrationPct: 75, saltPct: 2, levainPct: 20 },
      '1-2-2',
    )
    expect(at(r, 'Flour').grams).toBeCloseTo(900, 6)
    expect(at(r, 'Water').grams).toBeCloseTo(650, 6)
    expect(at(r, 'Levain').grams).toBeCloseTo(200, 6)
    expect(at(r, 'Salt').grams).toBeCloseTo(20, 6)
    expect(r.totalDough).toBeCloseTo(1770, 6)
  })

  it('keeps total flour and total water on target whatever the levain size', () => {
    for (const levainPct of [5, 10, 20, 30, 40]) {
      const r = computeRecipe(
        { totalFlour: 1000, hydrationPct: 75, saltPct: 2, levainPct },
        '1-2-2',
      )
      const levainFlour = at(r, 'Levain').grams / 2 // 100% hydration
      const levainWater = at(r, 'Levain').grams / 2
      expect(at(r, 'Flour').grams + levainFlour).toBeCloseTo(1000, 6)
      expect(at(r, 'Water').grams + levainWater).toBeCloseTo(750, 6)
      expect(r.actualHydrationPct).toBeCloseTo(75, 6)
    }
  })

  /*
   * A stiff levain is 50% hydration, so it carries less water for the same
   * weight — you add more water and less flour to land on the same dough.
   */
  it('shifts the flour/water split for a stiff levain', () => {
    const loose = computeRecipe(
      { totalFlour: 1000, hydrationPct: 75, saltPct: 2, levainPct: 20 },
      '1-2-2',
    )
    const stiff = computeRecipe(
      { totalFlour: 1000, hydrationPct: 75, saltPct: 2, levainPct: 20 },
      'stiff-1-2-1',
    )
    expect(at(stiff, 'Flour').grams).toBeLessThan(at(loose, 'Flour').grams)
    expect(at(stiff, 'Water').grams).toBeGreaterThan(at(loose, 'Water').grams)
    // Same dough weight either way, just divided differently.
    expect(stiff.totalDough).toBeCloseTo(loose.totalDough, 6)
    expect(at(stiff, 'Flour').grams).toBeCloseTo(1000 - 200 / 1.5, 6)
  })

  it('scales linearly with batch size', () => {
    const small = computeRecipe({ ...DEFAULT_RECIPE, totalFlour: 500 }, '1-2-2')
    const big = computeRecipe({ ...DEFAULT_RECIPE, totalFlour: 1000 }, '1-2-2')
    expect(big.totalDough).toBeCloseTo(small.totalDough * 2, 6)
  })

  describe('warnings', () => {
    const warn = (input: Partial<Parameters<typeof computeRecipe>[0]>) =>
      computeRecipe({ ...DEFAULT_RECIPE, ...input }, '1-2-2').warnings.join(' ')

    it('is quiet for an ordinary formula', () => {
      expect(computeRecipe(DEFAULT_RECIPE, '1-2-2').warnings).toEqual([])
    })

    it('catches a levain wetter than the target hydration', () => {
      // 40% levain at 100% hydration carries 20% water; ask for 15% total.
      expect(warn({ hydrationPct: 15, levainPct: 40 })).toMatch(/more water/i)
    })

    it('flags extreme hydration and salt', () => {
      expect(warn({ hydrationPct: 90 })).toMatch(/slack/i)
      expect(warn({ hydrationPct: 58 })).toMatch(/stiff/i)
      expect(warn({ saltPct: 3 })).toMatch(/salt/i)
      expect(warn({ saltPct: 1 })).toMatch(/salt/i)
    })
  })
})

describe('formatting', () => {
  it('rounds grams the way a kitchen scale reads', () => {
    expect(grams(650.4)).toBe('650 g')
    expect(grams(4.25)).toBe('4.3 g')
    expect(grams(NaN)).toBe('—')
  })

  it('drops a trailing .0 from percentages', () => {
    expect(pct(75)).toBe('75%')
    expect(pct(66.7)).toBe('66.7%')
    expect(pct(null)).toBe('')
  })

  it('splits a batch across loaves', () => {
    expect(perLoaf(1800, 2)).toBe(900)
    // Never divides by zero.
    expect(perLoaf(1800, 0)).toBe(1800)
  })
})
