/**
 * Temperature scaling for fermentation.
 *
 * Yeast and bacteria activity roughly doubles for every 10 °C rise — the
 * classic Q10 rule. Every fermentation duration in this app is authored at a
 * reference temperature and then scaled by `fermentFactor`.
 *
 * A factor > 1 means "slower, takes longer" (cold kitchen); < 1 means
 * "faster, takes less time" (warm kitchen).
 */

/** All base durations in this app are authored for this dough temperature. */
export const REFERENCE_C = 24

/** Rate multiplier per 10 °C. 2 is the conventional baking rule of thumb. */
const Q10 = 2

/** Clamp so an absurd input can't produce a nonsense 40-hour bulk. */
const MIN_FACTOR = 0.35
const MAX_FACTOR = 3.5

export function fermentFactor(tempC: number, referenceC = REFERENCE_C): number {
  const raw = Math.pow(Q10, (referenceC - tempC) / 10)
  return Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, raw))
}

export const cToF = (c: number): number => (c * 9) / 5 + 32
export const fToC = (f: number): number => ((f - 32) * 5) / 9

export type TempUnit = 'C' | 'F'

export function formatTemp(c: number, unit: TempUnit): string {
  return unit === 'C' ? `${Math.round(c)}°C` : `${Math.round(cToF(c))}°F`
}

/**
 * A temperature *difference*, which converts by ratio rather than by the full
 * formula — 10 °C warmer is 18 °F warmer, not 50 °F warmer.
 */
export function formatTempDelta(deltaC: number, unit: TempUnit): string {
  return unit === 'C'
    ? `${Math.round(deltaC)}°C`
    : `${Math.round((deltaC * 9) / 5)}°F`
}

/**
 * Plain-language read on what a given dough temperature will do, shown next to
 * the temperature slider so the number means something.
 */
export function tempAdvice(tempC: number): { label: string; note: string } {
  if (tempC < 18) {
    return {
      label: 'Cold',
      note: 'Very slow. Great for flavour, but bulk can run all day — find a warmer spot if you want to bake today.',
    }
  }
  if (tempC < 22) {
    return {
      label: 'Cool',
      note: 'Slow and forgiving. Long bulk, lots of flavour, hard to over-proof by accident.',
    }
  }
  if (tempC < 26) {
    return {
      label: 'Ideal',
      note: 'The sweet spot. Predictable timings and a good balance of strength and flavour.',
    }
  }
  if (tempC < 29) {
    return {
      label: 'Warm',
      note: 'Fast. Watch the dough rather than the clock — it can go from ready to over-proofed quickly.',
    }
  }
  return {
    label: 'Hot',
    note: 'Very fast and acidic. Bulk may be under 3 hours; check early and often, and expect a slacker dough.',
  }
}
