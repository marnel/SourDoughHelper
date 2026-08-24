/**
 * Bake schedule generation.
 *
 * A plan is authored as a chain of steps with base durations at 24 °C. The
 * chain is first laid out on a relative timeline starting at t = 0, and then
 * shifted so that whichever moment the baker actually knows — "my starter
 * peaks at 6pm", "I want bread out of the oven at 8am" — lands where they said.
 *
 * That shift is what makes forward and backward planning the same code path.
 */

import { getRatio } from './ratios'
import { fermentFactor } from './temperature'

export type StepKey =
  | 'levain'
  | 'autolyse'
  | 'mix'
  | 'bulk'
  | 'fold'
  | 'preshape'
  | 'bench'
  | 'shape'
  | 'proof'
  | 'retard'
  | 'preheat'
  | 'bakeLidOn'
  | 'bakeLidOff'
  | 'cool'

export interface PlanInput {
  /** Ambient/dough temperature during bulk, in °C. */
  doughTempC: number
  /** Base bulk fermentation length at 24 °C, in hours. */
  bulkHours: number
  autolyseMin: number
  foldSets: number
  /** Base gap between stretch-and-fold sets at 24 °C, in minutes. */
  foldIntervalMin: number
  benchMin: number
  /**
   * Cold retard in the fridge, in hours. 0 swaps it for a room-temperature
   * final proof instead — a same-day bake still has to proof after shaping.
   */
  retardHours: number
  /** Room-temperature final proof at 24 °C, used when retardHours is 0. */
  finalProofHours: number
  preheatMin: number
  bakeLidOnMin: number
  bakeLidOffMin: number
  coolMin: number
  /** Include the levain build, or start from an already-peaked starter. */
  includeLevainBuild: boolean
}

export const DEFAULT_PLAN: PlanInput = {
  doughTempC: 24,
  bulkHours: 5,
  autolyseMin: 45,
  foldSets: 4,
  foldIntervalMin: 30,
  benchMin: 25,
  retardHours: 14,
  finalProofHours: 2.5,
  preheatMin: 55,
  bakeLidOnMin: 20,
  bakeLidOffMin: 22,
  coolMin: 120,
  includeLevainBuild: true,
}

export type AnchorKind =
  | 'feed-starter'
  | 'starter-ready'
  | 'out-of-oven'
  | 'ready-to-eat'

export const ANCHOR_LABELS: Record<AnchorKind, string> = {
  'feed-starter': 'I am feeding my starter now',
  'starter-ready': 'My starter will peak at',
  'out-of-oven': 'I want it out of the oven at',
  'ready-to-eat': 'I want to slice it at',
}

export interface ScheduledStep {
  /** Unique within a schedule — fold sets get an index suffix. */
  id: string
  key: StepKey
  title: string
  /** What to actually do. */
  detail: string
  /** Epoch ms. */
  start: number
  end: number
  durationMin: number
  /** True if this step is a wait worth putting a timer on. */
  timer: boolean
  /** Folds are shown nested inside the bulk step. */
  parent?: StepKey
  /** Set when the step's duration was stretched or squeezed by temperature. */
  tempAdjusted: boolean
}

export interface Schedule {
  steps: ScheduledStep[]
  /** Wall-clock span from the first step to the last. */
  totalMs: number
  factor: number
  warnings: string[]
}

interface StepSpec {
  key: StepKey
  title: string
  detail: string
  durationMin: number
  timer: boolean
  /** Scale by the temperature factor. */
  scales: boolean
  /**
   * Run inside the tail of the previous step instead of after it — this is how
   * the oven preheats while the dough is still in the fridge.
   */
  overlapsPrevious?: boolean
  /** Skip entirely when false. */
  include?: boolean
}

export function buildSchedule(
  plan: PlanInput,
  /** Shared app-wide, so it is passed in rather than stored on the plan. */
  ratioId: string,
  anchor: AnchorKind,
  anchorAt: Date,
): Schedule {
  const factor = fermentFactor(plan.doughTempC)
  const ratio = getRatio(ratioId)
  const warnings: string[] = []

  const scaled = (min: number): number => Math.round(min * factor)

  const specs: StepSpec[] = [
    {
      key: 'levain',
      title: `Build the levain (${ratio.label})`,
      detail: `Mix your starter with fresh flour and water at ${ratio.label} and leave it somewhere warm. It is ready when it has domed, smells sweet and tangy rather than sharp, and a spoonful floats.`,
      durationMin: ratio.peakHoursAt24C * 60,
      timer: true,
      scales: true,
      include: plan.includeLevainBuild,
    },
    {
      key: 'autolyse',
      title: 'Autolyse',
      detail:
        'Mix the flour and water only — no levain, no salt — until no dry patches remain, then cover and rest. The flour hydrates fully and the dough becomes extensible with no work from you.',
      durationMin: plan.autolyseMin,
      timer: true,
      scales: false,
    },
    {
      key: 'mix',
      title: 'Add levain and salt',
      detail:
        'Add the levain and squeeze it through the dough, then add the salt and work it in. Pinch and fold for 3–5 minutes until the dough comes together smoothly and starts to pull away from the bowl.',
      durationMin: 15,
      timer: false,
      scales: false,
    },
    {
      key: 'bulk',
      title: 'Bulk fermentation',
      detail:
        'The main rise. Keep the bowl covered and at a steady temperature. You are looking for roughly 50–75% growth in volume, a domed and jiggly surface, and a few bubbles at the edges — not doubling. Trust the dough over the clock.',
      durationMin: plan.bulkHours * 60,
      timer: true,
      scales: true,
    },
    {
      key: 'preshape',
      title: 'Pre-shape',
      detail:
        'Turn the dough onto a lightly floured bench and, with minimal handling, pull it into a loose round with some surface tension. This organises the dough so the final shape is tidier.',
      durationMin: 10,
      timer: false,
      scales: false,
    },
    {
      key: 'bench',
      title: 'Bench rest',
      detail:
        'Leave the round uncovered on the bench to relax. It should spread a little and lose its tightness — if it is still springy, give it another ten minutes.',
      durationMin: plan.benchMin,
      timer: true,
      scales: true,
    },
    {
      key: 'shape',
      title: 'Final shape',
      detail:
        'Shape into a boule or bâtard with a taut skin, then place seam-side up in a floured banneton or a bowl lined with a tea towel. Cover.',
      durationMin: 10,
      timer: false,
      scales: false,
    },
    {
      key: 'proof',
      title: 'Final proof',
      detail:
        'Proof at room temperature until the loaf has grown by about half and springs back slowly when poked — a dent that fills in lazily is ready, one that stays put has gone too far.',
      durationMin: plan.finalProofHours * 60,
      timer: true,
      scales: true,
      // The same-day alternative to a cold retard.
      include: plan.retardHours <= 0,
    },
    {
      key: 'retard',
      title: 'Cold retard',
      detail:
        'Into the fridge, uncovered or lightly covered. The cold slows fermentation to a crawl while flavour keeps developing, firms the dough so it scores cleanly, and lets you bake whenever suits you.',
      durationMin: plan.retardHours * 60,
      timer: true,
      // Fridge temperature is independent of the kitchen.
      scales: false,
      include: plan.retardHours > 0,
    },
    {
      key: 'preheat',
      title: 'Preheat the oven',
      detail:
        'Dutch oven inside, lid on, 250°C / 480°F. Give it the full time — a properly saturated cast-iron pot is most of what makes the crust and the spring.',
      durationMin: plan.preheatMin,
      timer: true,
      scales: false,
      // Starts before the previous step ends so the oven is hot the moment the
      // dough comes out of the fridge.
      overlapsPrevious: true,
    },
    {
      key: 'bakeLidOn',
      title: 'Bake — lid on',
      detail:
        'Turn the dough out onto parchment, score it about 1 cm deep in one confident stroke, and lower it in. Lid on, 250°C / 480°F. The trapped steam is what lets it rise before the crust sets.',
      durationMin: plan.bakeLidOnMin,
      timer: true,
      scales: false,
    },
    {
      key: 'bakeLidOff',
      title: 'Bake — lid off',
      detail:
        'Lid off, drop to 230°C / 450°F, and bake until deeply coloured — darker than feels comfortable. Done is a hollow sound underneath, or 96–99°C / 205–210°F in the centre.',
      durationMin: plan.bakeLidOffMin,
      timer: true,
      scales: false,
    },
    {
      key: 'cool',
      title: 'Cool completely',
      detail:
        'Onto a wire rack, and leave it alone. The crumb is still setting; cutting early makes it gummy. Two hours minimum, four is better.',
      durationMin: plan.coolMin,
      timer: true,
      scales: false,
    },
  ]

  // --- Lay the chain out on a relative timeline (minutes from 0). ----------
  const steps: Array<Omit<ScheduledStep, 'start' | 'end'> & {
    startMin: number
    endMin: number
  }> = []
  let cursor = 0

  for (const spec of specs) {
    if (spec.include === false) continue
    const duration = spec.scales ? scaled(spec.durationMin) : spec.durationMin

    let startMin: number
    let endMin: number
    if (spec.overlapsPrevious) {
      // Ends where the previous step ends; does not push the chain along.
      endMin = cursor
      startMin = cursor - duration
    } else {
      startMin = cursor
      endMin = cursor + duration
      cursor = endMin
    }

    steps.push({
      id: spec.key,
      key: spec.key,
      title: spec.title,
      detail: spec.detail,
      durationMin: duration,
      timer: spec.timer,
      tempAdjusted: spec.scales && duration !== spec.durationMin,
      startMin,
      endMin,
    })

    // Stretch-and-fold sets live inside bulk fermentation.
    if (spec.key === 'bulk' && plan.foldSets > 0) {
      const gap = scaled(plan.foldIntervalMin)
      for (let i = 0; i < plan.foldSets; i++) {
        const at = startMin + gap * (i + 1)
        steps.push({
          id: `fold-${i + 1}`,
          key: 'fold',
          title: `Stretch and fold — set ${i + 1} of ${plan.foldSets}`,
          detail:
            i === 0
              ? 'Wet one hand. Lift one side of the dough up until it resists, fold it over the middle, and turn the bowl a quarter turn. Four lifts is one set.'
              : 'Another set of four lifts and folds. The dough should feel tighter and smoother than last time — when it resists early and holds a dome, it has enough strength.',
          durationMin: 3,
          timer: false,
          tempAdjusted: gap !== plan.foldIntervalMin,
          parent: 'bulk',
          startMin: at,
          endMin: at + 3,
        })
      }

      const lastFold = startMin + gap * plan.foldSets
      if (lastFold > endMin) {
        warnings.push(
          `${plan.foldSets} fold sets spaced ${gap} minutes apart run past the end of bulk. Reduce the sets or shorten the interval.`,
        )
      } else if (lastFold - startMin > (endMin - startMin) * 0.7) {
        warnings.push(
          'Your fold sets stretch into the last third of bulk. Folding late knocks the gas out of a dough that is trying to finish rising — aim to be done by the halfway mark.',
        )
      }
    }
  }

  // --- Shift the timeline so the anchor lands on the requested clock time. --
  const first = steps.reduce((m, s) => Math.min(m, s.startMin), Infinity)
  const last = steps.reduce((m, s) => Math.max(m, s.endMin), -Infinity)

  const anchorMin = resolveAnchorMinute(steps, anchor, first, last)
  const offsetMs = anchorAt.getTime() - anchorMin * 60_000

  const resolved: ScheduledStep[] = steps
    .map(({ startMin, endMin, ...rest }) => ({
      ...rest,
      start: offsetMs + startMin * 60_000,
      end: offsetMs + endMin * 60_000,
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end)

  if (!plan.includeLevainBuild && anchor === 'feed-starter') {
    warnings.push(
      'This plan starts from an already-peaked starter, so "feeding now" and "starter ready" are the same moment. Turn the levain build back on to plan the feed.',
    )
  }

  return {
    steps: resolved,
    totalMs: (last - first) * 60_000,
    factor,
    warnings,
  }
}

function resolveAnchorMinute(
  steps: Array<{ key: StepKey; startMin: number; endMin: number }>,
  anchor: AnchorKind,
  first: number,
  last: number,
): number {
  const find = (key: StepKey) => steps.find((s) => s.key === key)
  switch (anchor) {
    case 'feed-starter':
      return first
    case 'starter-ready': {
      const levain = find('levain')
      // Without a levain build, "ready" is simply the start of the bake day.
      return levain ? levain.endMin : first
    }
    case 'out-of-oven': {
      const bake = find('bakeLidOff') ?? find('bakeLidOn')
      return bake ? bake.endMin : last
    }
    case 'ready-to-eat':
      return last
  }
}

/** The step that is happening at a given moment, for the "now" highlight. */
export function currentStep(
  schedule: Schedule,
  now: number,
): ScheduledStep | undefined {
  return schedule.steps.find(
    (s) => s.key !== 'fold' && now >= s.start && now < s.end,
  )
}

/** The next thing the baker has to physically do. */
export function nextAction(
  schedule: Schedule,
  now: number,
): ScheduledStep | undefined {
  return schedule.steps.find((s) => s.start > now)
}
