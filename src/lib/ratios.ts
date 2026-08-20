/**
 * Starter feeding ratios.
 *
 * A ratio is written starter : flour : water by *weight*. "1:2:2" means one
 * part existing starter, two parts fresh flour, two parts water — so 20 g of
 * starter is fed 40 g flour and 40 g water.
 *
 * `peakHoursAt24C` is how long that mix takes to reach its peak (maximum rise,
 * domed and just starting to flatten) at the reference temperature. Scale it
 * with `fermentFactor` from ./temperature for a real kitchen.
 */

export interface Ratio {
  id: string
  /** Display form, e.g. "1:2:2". */
  label: string
  starter: number
  flour: number
  water: number
  /** Hours to peak at 24 °C. */
  peakHoursAt24C: number
  /** One-line summary for the card header. */
  summary: string
  /** What this ratio is actually good for. */
  goodFor: string[]
  /** Honest downsides. */
  watchOut: string
  /** Hydration of the resulting starter, as a percentage of its flour. */
  hydrationPct: number
}

export const RATIOS: Ratio[] = [
  {
    id: '1-1-1',
    label: '1:1:1',
    starter: 1,
    flour: 1,
    water: 1,
    peakHoursAt24C: 4,
    hydrationPct: 100,
    summary: 'Fastest turnaround. Peaks in about 4 hours.',
    goodFor: [
      'Same-day baking when you need levain ready by lunchtime',
      'Waking up a starter that has been in the fridge for a week or two',
      'Cool kitchens, where everything else runs too slowly',
    ],
    watchOut:
      'Peaks and falls quickly — miss the window by two hours and it is already sour and slack. Also the most acidic option, because a large population of bacteria gets a small meal.',
  },
  {
    id: '1-2-2',
    label: '1:2:2',
    starter: 1,
    flour: 2,
    water: 2,
    peakHoursAt24C: 5.5,
    hydrationPct: 100,
    summary: 'The everyday default. Peaks in about 5–6 hours.',
    goodFor: [
      'A reliable once- or twice-daily feed on the counter',
      'Feeding after breakfast to build levain for an afternoon mix',
      'Your first ratio if you are not sure which to pick',
    ],
    watchOut:
      'Nothing much — this is the safe middle. If your starter is sluggish it may want a warmer spot rather than a different ratio.',
  },
  {
    id: '1-3-3',
    label: '1:3:3',
    starter: 1,
    flour: 3,
    water: 3,
    peakHoursAt24C: 7,
    hydrationPct: 100,
    summary: 'Feed in the morning, mix in the evening. Peaks around 7 hours.',
    goodFor: [
      'Fitting a peak around a working day',
      'Building a levain that is strong but not yet very sour',
      'Warm kitchens where 1:1:1 would peak before you got home',
    ],
    watchOut:
      'Needs a healthy starter to begin with — a weak culture can struggle to raise three times its weight in flour.',
  },
  {
    id: '1-4-4',
    label: '1:4:4',
    starter: 1,
    flour: 4,
    water: 4,
    peakHoursAt24C: 8.5,
    hydrationPct: 100,
    summary: 'Overnight on the counter. Peaks in roughly 8–9 hours.',
    goodFor: [
      'Feeding before bed and mixing first thing in the morning',
      'Milder, sweeter, more lactic flavour',
      'Building a big levain from a small amount of starter',
    ],
    watchOut:
      'In a warm kitchen this will still peak around midnight and be past its best by breakfast. Use it with a cooler spot, or step up to 1:5:5.',
  },
  {
    id: '1-5-5',
    label: '1:5:5',
    starter: 1,
    flour: 5,
    water: 5,
    peakHoursAt24C: 10,
    hydrationPct: 100,
    summary: 'A long, mild overnight build. Peaks around 10 hours.',
    goodFor: [
      'Warm kitchens, where you want an overnight feed to survive till morning',
      'Deliberately reducing sourness over a few feeds',
      'Going from a teaspoon of starter to a full levain in one step',
    ],
    watchOut:
      'Big dilution means the culture needs real strength. If it does not roughly triple, drop back to 1:3:3 for a couple of feeds first.',
  },
  {
    id: '1-10-10',
    label: '1:10:10',
    starter: 1,
    flour: 10,
    water: 10,
    peakHoursAt24C: 14,
    hydrationPct: 100,
    summary: 'The reset button. Peaks in 12–16 hours.',
    goodFor: [
      'Dialling back a starter that has gone sharply acidic or vinegary',
      'Very mild, almost yoghurty flavour for enriched doughs',
      'Stretching a scrap of starter into a large quantity',
    ],
    watchOut:
      'Slow and only for genuinely vigorous starters. Two or three feeds at this ratio will noticeably mellow a sour culture, but a weak one will simply go flat and grey.',
  },
  {
    id: 'stiff-1-2-1',
    label: '1:2:1 (stiff)',
    starter: 1,
    flour: 2,
    water: 1,
    peakHoursAt24C: 8,
    hydrationPct: 50,
    summary: 'A firm 50%-hydration levain. Peaks around 8 hours.',
    goodFor: [
      'More dough strength and a taller, more open crumb',
      'Sweet and enriched breads — panettone, brioche, babka',
      'Suppressing acetic sourness while keeping plenty of lift',
    ],
    watchOut:
      'A stiff dough, not a batter — knead it into a ball rather than stirring. Judge it by "roughly tripled and domed" rather than by bubbles, since you cannot see through it.',
  },
]

export const DEFAULT_RATIO_ID = '1-2-2'

export function getRatio(id: string): Ratio {
  return RATIOS.find((r) => r.id === id) ?? RATIOS[1]!
}

export interface FeedAmounts {
  starter: number
  flour: number
  water: number
  total: number
}

/**
 * Work out a feed from the amount of *existing starter* you want to use.
 * This is the "I have 20 g left in the jar" direction.
 */
export function feedFromStarter(ratio: Ratio, starterGrams: number): FeedAmounts {
  const unit = starterGrams / ratio.starter
  const flour = unit * ratio.flour
  const water = unit * ratio.water
  return {
    starter: starterGrams,
    flour,
    water,
    total: starterGrams + flour + water,
  }
}

/**
 * Work out a feed backwards from the total weight you need — the
 * "my recipe calls for 200 g of levain" direction.
 */
export function feedFromTotal(ratio: Ratio, totalGrams: number): FeedAmounts {
  const parts = ratio.starter + ratio.flour + ratio.water
  const unit = totalGrams / parts
  return {
    starter: unit * ratio.starter,
    flour: unit * ratio.flour,
    water: unit * ratio.water,
    total: totalGrams,
  }
}

/** Flour and water a levain contributes to the dough's baker's percentages. */
export function levainComposition(
  ratio: Ratio,
  totalGrams: number,
): { flour: number; water: number } {
  // The seed starter is itself flour and water at its own hydration; treating
  // the whole levain as one hydration is accurate as long as the seed came
  // from the same jar, which is the normal case.
  const h = ratio.hydrationPct / 100
  const flour = totalGrams / (1 + h)
  return { flour, water: totalGrams - flour }
}
