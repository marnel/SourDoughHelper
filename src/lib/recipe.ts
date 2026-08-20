/**
 * Baker's percentages.
 *
 * Everything is a percentage of *total flour* — including the flour that comes
 * in via the levain. That is the convention professional formulas use, and it
 * is the only way "75% hydration" means the same thing whether your levain is
 * 15% or 30% of the formula.
 *
 * So for 1000 g total flour at 75% hydration with a 20% 100%-hydration levain:
 *   levain      = 200 g  (100 g flour + 100 g water)
 *   flour to add = 1000 − 100 = 900 g
 *   water to add =  750 − 100 = 650 g
 *   salt         = 20 g
 */

import { getRatio, levainComposition } from './ratios'
import { REFERENCE_C, formatTemp, type TempUnit } from './temperature'

export interface RecipeInput {
  /** Total flour in the formula, in grams, including levain flour. */
  totalFlour: number
  /** Target dough hydration as a percentage of total flour. */
  hydrationPct: number
  /** Salt as a percentage of total flour. */
  saltPct: number
  /** Levain as a percentage of total flour. */
  levainPct: number
  /** Which starter ratio the levain was built at — sets its hydration. */
  ratioId: string
}

export interface RecipeLine {
  name: string
  grams: number
  /** Percentage of total flour, or null where a percentage is meaningless. */
  pct: number | null
  note?: string
}

export interface Recipe {
  lines: RecipeLine[]
  totalDough: number
  /** True total hydration, after levain water is counted. */
  actualHydrationPct: number
  /** Warnings worth surfacing before someone mixes a 95%-hydration brick. */
  warnings: string[]
}

export const DEFAULT_RECIPE: RecipeInput = {
  totalFlour: 500,
  hydrationPct: 75,
  saltPct: 2,
  levainPct: 20,
  ratioId: '1-2-2',
}

export function computeRecipe(
  input: RecipeInput,
  tempUnit: TempUnit = 'C',
): Recipe {
  const { totalFlour, hydrationPct, saltPct, levainPct, ratioId } = input
  const ratio = getRatio(ratioId)

  const levainWeight = totalFlour * (levainPct / 100)
  const levain = levainComposition(ratio, levainWeight)

  const totalWater = totalFlour * (hydrationPct / 100)
  const salt = totalFlour * (saltPct / 100)

  const flourToAdd = totalFlour - levain.flour
  const waterToAdd = totalWater - levain.water

  const lines: RecipeLine[] = [
    {
      name: 'Flour',
      grams: flourToAdd,
      pct: (flourToAdd / totalFlour) * 100,
      note: 'Bread flour, or up to 20% wholemeal or rye',
    },
    {
      name: 'Water',
      grams: waterToAdd,
      pct: (waterToAdd / totalFlour) * 100,
      // Water runs a few degrees warmer than the target, since the flour and
      // the bowl are at room temperature and will pull the mix down.
      note: `Lukewarm, around ${formatTemp(REFERENCE_C + 4, tempUnit)}, to hit a ${formatTemp(REFERENCE_C, tempUnit)} dough`,
    },
    {
      name: `Levain (${ratio.label})`,
      grams: levainWeight,
      pct: levainPct,
      note: `Contains ${round(levain.flour)} g flour and ${round(levain.water)} g water`,
    },
    { name: 'Salt', grams: salt, pct: saltPct, note: 'Fine sea salt' },
  ]

  const totalDough = flourToAdd + waterToAdd + levainWeight + salt

  const warnings: string[] = []
  if (waterToAdd < 0) {
    warnings.push(
      'The levain alone carries more water than this hydration allows. Lower the levain percentage or raise the hydration.',
    )
  }
  if (hydrationPct > 85) {
    warnings.push(
      'Above about 85% this dough is very slack. Expect to use a banneton and to handle it wet — it will not hold a tall shape freestanding.',
    )
  }
  if (hydrationPct < 60) {
    warnings.push(
      'Below about 60% this is a stiff dough. It will need real kneading and will bake dense, closer to a pain de campagne than an open-crumb loaf.',
    )
  }
  if (saltPct > 2.6) {
    warnings.push(
      'Over about 2.5% salt starts to noticeably slow fermentation and taste salty.',
    )
  }
  if (saltPct < 1.4) {
    warnings.push(
      'Under about 1.5% salt the dough ferments fast and slackly, and the bread will taste flat.',
    )
  }

  return {
    lines,
    totalDough,
    actualHydrationPct: (totalWater / totalFlour) * 100,
    warnings,
  }
}

/**
 * Split a batch across loaves, so the recipe page can say "two 900 g loaves".
 */
export function perLoaf(totalDough: number, loaves: number): number {
  return loaves > 0 ? totalDough / loaves : totalDough
}

const round = (n: number): number => Math.round(n)

/** Grams, rounded the way a kitchen scale actually reads. */
export function grams(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (Math.abs(n) < 10) return `${n.toFixed(1)} g`
  return `${Math.round(n)} g`
}

export function pct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return ''
  return `${n.toFixed(n % 1 === 0 ? 0 : 1)}%`
}
