/**
 * Flour blends.
 *
 * A blend is described by how much of the total flour is wholemeal and how
 * much is rye; the rest is white bread flour. Two numbers rather than three
 * means the blend is always valid — no set of sliders that has to be coaxed
 * into summing to 100.
 *
 * Wholegrain changes three things, and they are modelled separately because
 * they are separately observable:
 *
 *  1. What you weigh out. Obvious, but the levain has already contributed
 *     flour, which has to come out of somewhere.
 *  2. Absorption. Bran and germ hold far more water than endosperm, so the
 *     same hydration number produces a visibly stiffer dough.
 *  3. Fermentation speed. Wholegrain carries more of the minerals, enzymes and
 *     wild microbes that fermentation runs on, so it ferments faster. Rye is
 *     faster still, mostly from its amylase activity.
 */

export interface FlourBlend {
  /** Percentage of total flour that is wholemeal/wholewheat. */
  wholemealPct: number
  /** Percentage of total flour that is rye. */
  ryePct: number
}

export const DEFAULT_BLEND: FlourBlend = { wholemealPct: 0, ryePct: 0 }

/** White bread flour makes up whatever is left. */
export function whitePct(blend: FlourBlend): number {
  const rest = 100 - clampPct(blend.wholemealPct) - clampPct(blend.ryePct)
  return Math.max(0, Math.round(rest * 1000) / 1000)
}

function clampPct(n: number): number {
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0
}

/** Normalised fractions that always sum to 1. */
export function fractions(blend: FlourBlend): {
  white: number
  wholemeal: number
  rye: number
} {
  const wholemeal = clampPct(blend.wholemealPct)
  const rye = clampPct(blend.ryePct)
  const total = wholemeal + rye
  // Cap rather than reject, so dragging both sliders up cannot exceed 100%.
  if (total > 100) {
    return { white: 0, wholemeal: wholemeal / total, rye: rye / total }
  }
  return {
    white: whitePct(blend) / 100,
    wholemeal: wholemeal / 100,
    rye: rye / 100,
  }
}

export const totalWholegrainPct = (blend: FlourBlend): number =>
  Math.round((1 - fractions(blend).white) * 100)

// --- Fermentation speed ---------------------------------------------------

/**
 * How fast each flour ferments relative to white. A 100% wholewheat dough runs
 * roughly a quarter to a third quicker than the same formula in white, which
 * is what 1.3 encodes; rye is quicker again.
 */
const SPEED = { white: 1, wholemeal: 1.3, rye: 1.45 }

/**
 * Multiplier on fermentation *time* for a blend: below 1 means faster. Applied
 * to the dough's own fermentation only, alongside the inoculation shift and
 * before the temperature factor.
 */
export function flourTimeFactor(blend: FlourBlend): number {
  const f = fractions(blend)
  const rate =
    f.white * SPEED.white + f.wholemeal * SPEED.wholemeal + f.rye * SPEED.rye
  return rate > 0 ? 1 / rate : 1
}

// --- Absorption -----------------------------------------------------------

/**
 * Extra hydration points a flour needs, at 100% of that flour, to feel like
 * white does. Wholemeal is the widely quoted "add about 10%"; rye more.
 */
const ABSORPTION = { white: 0, wholemeal: 10, rye: 15 }

/**
 * Hydration points this blend wants on top of a white-flour formula. Advisory
 * only — hydration stays whatever the baker set, because it is a definition
 * (water over flour) rather than something to be quietly rewritten.
 */
export function absorptionBonus(blend: FlourBlend): number {
  const f = fractions(blend)
  return (
    f.wholemeal * ABSORPTION.wholemeal + f.rye * ABSORPTION.rye
  )
}

export function blendAdvice(blend: FlourBlend): { label: string; note: string } {
  const wholegrain = totalWholegrainPct(blend)
  const rye = clampPct(blend.ryePct)

  if (wholegrain === 0) {
    return {
      label: 'All white',
      note: 'Strong white bread flour. The most forgiving dough and the most open crumb.',
    }
  }
  if (rye >= 40) {
    return {
      label: 'Rye-heavy',
      note: 'Sticky and fast. Rye has little gluten, so expect a dense, moist crumb and handle it with wet hands rather than flour.',
    }
  }
  if (wholegrain <= 20) {
    return {
      label: 'Lightly seeded',
      note: 'Enough wholegrain for flavour and a livelier ferment, without much cost to the rise.',
    }
  }
  if (wholegrain <= 50) {
    return {
      label: 'Half and half',
      note: 'Noticeably faster and thirstier. Watch the bulk — it will finish sooner than an all-white loaf.',
    }
  }
  return {
    label: 'Mostly wholegrain',
    note: 'Fast, thirsty and heavy. Expect a tighter crumb, a shorter bulk, and dough that keeps drinking water as it rests.',
  }
}
