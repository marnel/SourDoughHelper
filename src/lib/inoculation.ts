/**
 * How much levain you use changes how long the dough takes.
 *
 * The model is a population one rather than a fudge factor. Yeast grows
 * exponentially, so the dough is ready after however many doublings it takes to
 * get from the starting population to the target. Starting with twice as much
 * levain removes exactly one doubling — not half the time.
 *
 *     minutes = base + GENERATION_MIN × log2(REFERENCE_PCT / levainPct)
 *
 * That matches what bakers actually report: around 20% levain gives a 4–5 hour
 * bulk, halving it to 10% adds an hour and a half, and 40% takes an hour and a
 * half off. A naive "double the levain, halve the time" rule would predict 2.5
 * hours at 40%, which is wrong enough to ruin a loaf.
 *
 * The shift is computed in the 24 °C domain and the temperature factor is
 * applied afterwards, because a generation is itself shorter when it is warm.
 *
 * Deliberately not modelled: hydration. Wetter dough does ferment a little
 * faster, but the effect is small next to temperature and inoculation, and
 * inventing a coefficient would add false precision rather than accuracy.
 */

/** The levain percentage the plan's base durations are authored at. */
export const REFERENCE_LEVAIN_PCT = 20

/**
 * Time for the population to double at 24 °C. Derived from the gap between the
 * usual 20% and 10% timings rather than measured, so treat it as a shape that
 * fits observation, not a constant of nature.
 */
const GENERATION_MIN = 90

/** Never shift by more than this, whatever the input. */
const MAX_SHIFT_MIN = 240

/**
 * Minutes to add to a room-temperature fermentation at 24 °C for a given
 * levain percentage. Negative when the dough is inoculated more heavily than
 * the reference.
 */
export function inoculationShiftMin(levainPct: number): number {
  if (!Number.isFinite(levainPct) || levainPct <= 0) return 0
  const raw = GENERATION_MIN * Math.log2(REFERENCE_LEVAIN_PCT / levainPct)
  return Math.round(Math.min(MAX_SHIFT_MIN, Math.max(-MAX_SHIFT_MIN, raw)))
}

/**
 * Plain-language read on a levain percentage, for the slider hint. Pairs with
 * `tempAdvice` — between them they cover the two levers that actually matter.
 */
export function levainAdvice(levainPct: number): {
  label: string
  note: string
} {
  if (levainPct < 10) {
    return {
      label: 'Very small',
      note: 'A long, slow bulk with plenty of flavour. Add hours to your day and keep the kitchen warm, or it may not finish at all.',
    }
  }
  if (levainPct < 16) {
    return {
      label: 'Small',
      note: 'Slower and more forgiving, with a milder, sweeter crumb. Hard to over-proof by accident.',
    }
  }
  if (levainPct <= 25) {
    return {
      label: 'Standard',
      note: 'The everyday range. Predictable timings and a good balance of flavour and strength.',
    }
  }
  if (levainPct <= 33) {
    return {
      label: 'Large',
      note: 'Fast and noticeably more sour. Watch the dough rather than the clock — the window narrows.',
    }
  }
  return {
    label: 'Very large',
    note: 'Very fast and quite acidic. Bulk can be under three hours, and over-proofing sneaks up on you.',
  }
}
