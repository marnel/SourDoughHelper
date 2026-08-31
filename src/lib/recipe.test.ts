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
    expect(at(r, 'White flour').grams).toBeCloseTo(900, 6)
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
      expect(at(r, 'White flour').grams + levainFlour).toBeCloseTo(1000, 6)
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
    expect(at(stiff, 'White flour').grams).toBeLessThan(at(loose, 'White flour').grams)
    expect(at(stiff, 'Water').grams).toBeGreaterThan(at(loose, 'Water').grams)
    // Same dough weight either way, just divided differently.
    expect(stiff.totalDough).toBeCloseTo(loose.totalDough, 6)
    expect(at(stiff, 'White flour').grams).toBeCloseTo(1000 - 200 / 1.5, 6)
  })

  describe('flour blend', () => {
    const blended = (wholemealPct: number, ryePct: number) =>
      computeRecipe(
        {
          totalFlour: 1000,
          hydrationPct: 75,
          saltPct: 2,
          levainPct: 20,
          wholemealPct,
          ryePct,
        },
        '1-2-2',
      )

    it('shows only the flours actually used', () => {
      expect(blended(0, 0).lines.map((l) => l.name)).not.toContain('Rye')
      expect(blended(20, 10).lines.map((l) => l.name)).toContain('Rye')
    })

    it('splits the flour you weigh out across the blend', () => {
      const r = blended(20, 10)
      // 1000 g total: 700 white, 200 wholemeal, 100 rye — less the levain's
      // 100 g of flour, which comes off the white.
      expect(at(r, 'White flour').grams).toBeCloseTo(600, 6)
      expect(at(r, 'Wholemeal').grams).toBeCloseTo(200, 6)
      expect(at(r, 'Rye').grams).toBeCloseTo(100, 6)
    })

    it('still totals the target flour once the levain is counted', () => {
      for (const [w, y] of [[0, 0], [20, 10], [50, 0], [0, 40]]) {
        const r = blended(w!, y!)
        const flour = r.lines
          .filter((l) => /flour|Wholemeal|Rye/i.test(l.name))
          .filter((l) => !l.name.startsWith('Levain'))
          .reduce((a, l) => a + l.grams, 0)
        expect(flour + 100).toBeCloseTo(1000, 6) // levain carries 100 g flour
      }
    })

    /*
     * A starter is nearly always fed white, so the levain's flour comes off
     * the white first and only spills into wholegrain when the white runs out.
     */
    it('spills into wholegrain only when there is not enough white', () => {
      const r = blended(100, 0)
      expect(at(r, 'Wholemeal').grams).toBeCloseTo(900, 6)
      expect(r.lines.map((l) => l.name)).not.toContain('White flour')
    })

    it('leaves water, salt and total dough unchanged', () => {
      const white = blended(0, 0)
      const brown = blended(30, 10)
      expect(brown.totalDough).toBeCloseTo(white.totalDough, 6)
      expect(at(brown, 'Water').grams).toBeCloseTo(at(white, 'Water').grams, 6)
    })
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
