import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RECIPE,
  computeRecipe,
  doughWeight,
  flourForDough,
  grams,
  pct,
  perLoaf,
} from './recipe'

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

describe('batch sizing', () => {
  it('gives dough weight as flour plus its water and salt', () => {
    // The levain cancels: it is flour and water already counted in the totals.
    expect(doughWeight(1000, 75, 2)).toBeCloseTo(1770, 6)
    expect(doughWeight(500, 80, 2)).toBeCloseTo(910, 6)
  })

  it('agrees with the full recipe calculation', () => {
    for (const totalFlour of [250, 500, 1000, 3050]) {
      for (const hydrationPct of [65, 75, 85]) {
        const r = computeRecipe(
          { ...DEFAULT_RECIPE, totalFlour, hydrationPct },
          '1-2-2',
        )
        expect(doughWeight(totalFlour, hydrationPct, DEFAULT_RECIPE.saltPct))
          .toBeCloseTo(r.totalDough, 6)
      }
    }
  })

  /*
   * Sizing a batch the way bakers actually think about it — "six loaves of
   * 900 g" — rather than reverse-engineering a flour weight to hit it.
   */
  it('works back from a target dough weight', () => {
    const flour = flourForDough(6 * 900, 75, 2)
    expect(flour).toBe(3050)
    expect(doughWeight(flour, 75, 2) / 6).toBeCloseTo(900, 0)
  })

  it('round-trips within its rounding step', () => {
    for (const loaves of [1, 2, 4, 6, 12]) {
      for (const per of [400, 900, 1200]) {
        const flour = flourForDough(loaves * per, 75, 2)
        // Within the 5 g flour step, which is ~9 g of dough on a single loaf.
        expect(Math.abs(doughWeight(flour, 75, 2) / loaves - per)).toBeLessThan(10)
      }
    }
  })

  it('rounds to a weight a scale can hit', () => {
    for (const target of [1234, 2345, 5400, 9999]) {
      expect(flourForDough(target, 75, 2) % 5).toBe(0)
    }
  })

  it('never returns a nonsense weight', () => {
    expect(flourForDough(0, 75, 2)).toBe(5)
    expect(flourForDough(1000, -300, 0)).toBe(0)
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
