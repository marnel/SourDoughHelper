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

import { DEFAULT_BLEND, fractions, type FlourBlend } from './flour'
import { getRatio, levainComposition } from './ratios'
import { KEYS } from './storage'
import { createStore } from './stores'
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
  /** Percentage of total flour that is wholemeal. Optional; defaults to none. */
  wholemealPct?: number
  /** Percentage of total flour that is rye. Optional; defaults to none. */
  ryePct?: number
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
  wholemealPct: 0,
  ryePct: 0,
}

/**
 * Shared: the Method tab edits the formula, and the planner needs its levain
 * percentage to time the bulk.
 */
export const recipeStore = createStore<RecipeInput>(KEYS.recipe, DEFAULT_RECIPE)

export function computeRecipe(
  input: RecipeInput,
  /** Shared app-wide; sets the levain's hydration. */
  ratioId: string,
  tempUnit: TempUnit = 'C',
): Recipe {
  const { totalFlour, hydrationPct, saltPct, levainPct } = input
  const ratio = getRatio(ratioId)
  const blend: FlourBlend = {
    wholemealPct: input.wholemealPct ?? DEFAULT_BLEND.wholemealPct,
    ryePct: input.ryePct ?? DEFAULT_BLEND.ryePct,
  }

  const levainWeight = totalFlour * (levainPct / 100)
  const levain = levainComposition(ratio, levainWeight)

  const totalWater = totalFlour * (hydrationPct / 100)
  const salt = totalFlour * (saltPct / 100)

  const flourToAdd = totalFlour - levain.flour
  const waterToAdd = totalWater - levain.water

  const lines: RecipeLine[] = [
    ...flourLines(totalFlour, flourToAdd, blend),
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

/**
 * Split the flour you weigh out across the blend.
 *
 * The blend describes *total* flour, but the levain has already supplied some.
 * That contribution is taken off the white first, since a starter is almost
 * always fed white, and only spills into the wholegrain if the white runs out.
 */
function flourLines(
  totalFlour: number,
  flourToAdd: number,
  blend: FlourBlend,
): RecipeLine[] {
  const f = fractions(blend)
  const target = {
    white: totalFlour * f.white,
    wholemeal: totalFlour * f.wholemeal,
    rye: totalFlour * f.rye,
  }

  const fromLevain = Math.max(0, totalFlour - flourToAdd)
  const whiteTaken = Math.min(target.white, fromLevain)
  let spill = fromLevain - whiteTaken
  const wholemealTaken = Math.min(target.wholemeal, spill)
  spill -= wholemealTaken

  const amounts = {
    white: target.white - whiteTaken,
    wholemeal: target.wholemeal - wholemealTaken,
    rye: Math.max(0, target.rye - spill),
  }

  const line = (name: string, grams: number, note: string): RecipeLine => ({
    name,
    grams,
    pct: (grams / totalFlour) * 100,
    note,
  })

  return [
    line('White flour', amounts.white, 'Strong white bread flour'),
    line('Wholemeal', amounts.wholemeal, 'Wholewheat, stoneground if you have it'),
    line('Rye', amounts.rye, 'Wholegrain or light rye'),
  ].filter((l) => l.grams > 0.05)
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
