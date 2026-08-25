/**
 * A bake in progress.
 *
 * Planning and baking need different anchors, and conflating them was a real
 * bug. While planning you work backwards from a target — "out of the oven at
 * 8am" — and the start time is whatever falls out. But once the dough is in
 * the bowl, the start is a fact and the finish is the thing that moves.
 *
 * Without this distinction, extending a bulk on a backward-anchored plan kept
 * the bake time fixed and slid the *start* an hour earlier, into the past.
 * Starting a bake therefore pins `startedAt`, and from then on the schedule is
 * built forward from that moment so adjustments push the finish later, which
 * is what actually happens in a kitchen.
 */

import type { Adjustments, StepKey } from './schedule'

export interface ActiveBake {
  /** Epoch ms of the first step — the moment this bake is pinned to. */
  startedAt: number
  /** Minutes added to individual steps as the bake ran long or short. */
  adjustments: Adjustments
}

export function startBake(startedAt: number): ActiveBake {
  return { startedAt, adjustments: {} }
}

/** Add (or subtract) minutes from one step, accumulating across adjustments. */
export function adjustStep(
  bake: ActiveBake,
  key: StepKey,
  deltaMin: number,
): ActiveBake {
  const current = bake.adjustments[key] ?? 0
  return {
    ...bake,
    adjustments: { ...bake.adjustments, [key]: current + deltaMin },
  }
}

/**
 * Set a step's adjustment so that it ends exactly now — "the dough is ready,
 * move on" — which pulls every later step earlier by the unused time.
 */
export function endStepNow(
  bake: ActiveBake,
  key: StepKey,
  currentEnd: number,
  now: number,
): ActiveBake {
  const deltaMin = Math.round((now - currentEnd) / 60_000)
  return adjustStep(bake, key, deltaMin)
}

/** Total drift from the original plan, in minutes. */
export function totalDrift(bake: ActiveBake): number {
  return Object.values(bake.adjustments).reduce<number>(
    (sum, v) => sum + (v ?? 0),
    0,
  )
}

export function isAdjusted(bake: ActiveBake): boolean {
  return totalDrift(bake) !== 0
}
