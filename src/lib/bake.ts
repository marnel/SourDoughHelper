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

import type {
  Adjustments,
  Schedule,
  ScheduledStep,
  StepKey,
} from './schedule'
import type { NewTimer } from './timers'
import { KEYS } from './storage'
import { createStore } from './stores'

export interface ActiveBake {
  /** Epoch ms of the first step — the moment this bake is pinned to. */
  startedAt: number
  /** Minutes added to individual steps as the bake ran long or short. */
  adjustments: Adjustments
}

/**
 * Shared because the Plan tab starts and ends bakes while the Timers tab
 * advances steps, and only one of those pages is mounted at a time.
 */
export const bakeStore = createStore<ActiveBake | null>(KEYS.bake, null)

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

/**
 * Which moment in a step the baker needs to be told about.
 *
 * Folds and the preheat are announced at their *start* — "fold now", "oven on
 * now". Everything else is a wait, so the alert belongs at the end, where it
 * doubles as the cue for whatever comes next.
 */
/**
 * Whether a step can be shifted from its timer. Only steps alerting at their
 * *end* qualify, since that is the only case where the timer's endsAt is the
 * step's end. Folds and the preheat announce their start.
 */
export function isShiftableStep(key: string | undefined): key is StepKey {
  return key !== undefined && key !== 'fold' && key !== 'preheat'
}

export function alertMoment(step: ScheduledStep): number {
  return step.key === 'fold' || step.key === 'preheat' ? step.start : step.end
}

/**
 * Hands-on steps (mixing, shaping) deliberately get no timer of their own —
 * they are named in the `Next:` line of the preceding alert instead. Giving
 * them one produced nonsense like "Final shape — done" firing at the same
 * moment as the step that actually matters.
 */
export function needsTimer(step: ScheduledStep): boolean {
  return step.timer || step.key === 'fold'
}

/**
 * Turn a schedule into the timers it implies. Hoisted out of the component so
 * the same construction serves both arming a bake and re-timing one after an
 * adjustment — the two must not drift apart.
 */
export function bakeTimersFor(schedule: Schedule, from: number): NewTimer[] {
  return schedule.steps
    .filter((s) => needsTimer(s) && alertMoment(s) > from)
    .map((step) => {
      const at = alertMoment(step)
      const isStartAlert = step.key === 'fold' || step.key === 'preheat'
      const following = schedule.steps.find(
        (s) => s.start >= step.end && s.key !== 'fold',
      )
      return {
        // The label is on screen for the whole countdown, so it names what is
        // happening now. An earlier version appended "— done", which meant a
        // timer with thirty minutes left read "Autolyse — done". What to do
        // when it fires belongs in the note, which is the notification body.
        label: step.title,
        note: isStartAlert
          ? step.detail
          : following
            ? `Next: ${following.title}.`
            : 'That is the last step.',
        durationMs: Math.max(1000, at - from),
        endsAt: at,
        stepKey: step.key,
        source: 'bake' as const,
      }
    })
}
