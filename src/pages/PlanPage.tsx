import { useMemo, useState } from 'react'
import { Card, Details, Segmented, Slider, Stepper } from '../components/Controls'
import { TempSlider } from '../components/TempSlider'
import { usePersisted, useNow, usePrefs } from '../hooks'
import {
  fmtDayHeading,
  fmtDayTime,
  fmtDuration,
  fmtRelative,
  fmtTime,
  fromDatetimeLocal,
  startOfDay,
  toDatetimeLocal,
} from '../lib/format'
import { RATIOS } from '../lib/ratios'
import { KEYS } from '../lib/storage'
import {
  ANCHOR_LABELS,
  DEFAULT_PLAN,
  buildSchedule,
  currentStep,
  type AnchorKind,
  type PlanInput,
  type ScheduledStep,
} from '../lib/schedule'
import { setPrefs } from '../lib/prefs'
import { replaceAll, type NewTimer } from '../lib/timers'
import { REFERENCE_C, formatTemp } from '../lib/temperature'

interface AnchorState {
  kind: AnchorKind
  /** Epoch ms. */
  at: number
}

/** Default to a loaf out of the oven at 9am tomorrow — the classic plan. */
function defaultAnchor(): AnchorState {
  const t = new Date()
  t.setDate(t.getDate() + 1)
  t.setHours(9, 0, 0, 0)
  return { kind: 'out-of-oven', at: t.getTime() }
}

/**
 * Which moment in a step the baker needs to be told about.
 *
 * Folds and the preheat are announced at their *start* — "fold now", "oven on
 * now". Everything else is a wait, so the alert belongs at the end, where it
 * doubles as the cue for whatever comes next.
 */
function alertMoment(step: ScheduledStep): number {
  return step.key === 'fold' || step.key === 'preheat' ? step.start : step.end
}

/**
 * Hands-on steps (mixing, shaping) deliberately get no timer of their own —
 * they are named in the `Next:` line of the preceding alert instead. Giving
 * them one produced nonsense like "Final shape — done" firing at the same
 * moment as the step that actually matters.
 */
function needsTimer(step: ScheduledStep): boolean {
  return step.timer || step.key === 'fold'
}

export function PlanPage() {
  const now = useNow(30_000)
  const { tempUnit, ratioId, tempC } = usePrefs()
  const [plan, setPlan] = usePersisted<PlanInput>(KEYS.plan, DEFAULT_PLAN)
  const [anchor, setAnchor] = usePersisted<AnchorState>(
    KEYS.anchor,
    defaultAnchor(),
  )
  const [armed, setArmed] = useState(false)

  const schedule = useMemo(
    () => buildSchedule(plan, ratioId, tempC, anchor.kind, new Date(anchor.at)),
    [plan, ratioId, tempC, anchor.kind, anchor.at],
  )

  const active = currentStep(schedule, now)
  const patchPlan = (p: Partial<PlanInput>) =>
    setPlan((prev) => ({ ...prev, ...p }))

  const upcoming = schedule.steps.filter(
    (s) => needsTimer(s) && alertMoment(s) > now,
  )

  const start = schedule.steps[0]?.start ?? now
  // A backward-planned bake can easily demand a start time that has already
  // passed. Saying so is far more useful than quietly showing a past timeline.
  const lateBy = now - start

  const armTimers = () => {
    const next: NewTimer[] = upcoming.map((step) => {
      const at = alertMoment(step)
      const isStartAlert = step.key === 'fold' || step.key === 'preheat'
      const following = schedule.steps.find((s) => s.start >= step.end && s.key !== 'fold')
      return {
        label: isStartAlert ? step.title : `${step.title} — done`,
        note: isStartAlert
          ? step.detail
          : following
            ? `Next: ${following.title}.`
            : 'That is the last step.',
        durationMs: Math.max(1000, at - Date.now()),
        endsAt: at,
        stepKey: step.key,
      }
    })
    replaceAll(next)
    setArmed(true)
    window.setTimeout(() => setArmed(false), 2500)
  }

  // Group the timeline into day sections so an overnight plan reads clearly.
  const days = useMemo(() => {
    const map = new Map<number, ScheduledStep[]>()
    for (const step of schedule.steps) {
      const key = startOfDay(step.start)
      const list = map.get(key)
      if (list) list.push(step)
      else map.set(key, [step])
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0])
  }, [schedule])

  return (
    <div className="page">
      <Card
        title="When do you want it?"
        subtitle="Tell it the one time you actually know, and it works out the rest."
      >
        <Segmented
          value={anchor.kind}
          onChange={(kind) => setAnchor((prev) => ({ ...prev, kind }))}
          options={(Object.keys(ANCHOR_LABELS) as AnchorKind[]).map((k) => ({
            value: k,
            label:
              k === 'feed-starter'
                ? 'Feeding now'
                : k === 'starter-ready'
                  ? 'Starter peaks'
                  : k === 'out-of-oven'
                    ? 'Out of oven'
                    : 'Slicing it',
          }))}
        />

        <div className="field">
          <label className="field-head" htmlFor="anchor-time">
            <span>{ANCHOR_LABELS[anchor.kind]}</span>
          </label>
          <input
            id="anchor-time"
            type="datetime-local"
            value={toDatetimeLocal(anchor.at)}
            onChange={(e) => {
              const ms = fromDatetimeLocal(e.target.value)
              if (ms !== null) setAnchor((prev) => ({ ...prev, at: ms }))
            }}
          />
          <p className="hint">
            {anchor.kind === 'feed-starter'
              ? 'Everything is measured forward from this feed.'
              : anchor.kind === 'starter-ready'
                ? 'The moment your levain is domed and ready to mix.'
                : anchor.kind === 'out-of-oven'
                  ? 'Working backwards from here, including the preheat.'
                  : 'Includes the full cool — this is when it is genuinely ready to cut.'}
          </p>
        </div>

        <div className="summary-grid">
          <div>
            <span className="summary-label">Start</span>
            <strong>{fmtDayTime(start)}</strong>
            <span className="summary-sub">{fmtRelative(start, now)}</span>
          </div>
          <div>
            <span className="summary-label">Total</span>
            <strong>{fmtDuration(schedule.totalMs / 60_000)}</strong>
            <span className="summary-sub">start to slice</span>
          </div>
          <div>
            <span className="summary-label">Hands-on</span>
            <strong>
              {fmtDuration(
                schedule.steps
                  .filter((s) => !s.timer)
                  .reduce((a, s) => a + s.durationMin, 0),
              )}
            </strong>
            <span className="summary-sub">the rest is waiting</span>
          </div>
        </div>

        {lateBy > 5 * 60_000 ? (
          <ul className="warnings">
            <li>
              This plan needed to start {fmtDuration(lateBy / 60_000)} ago. Move
              the target later, shorten the bulk or the retard, or pick a bigger
              levain ratio to catch up.
            </li>
          </ul>
        ) : null}

        {schedule.warnings.length > 0 ? (
          <ul className="warnings">
            {schedule.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}

        <button
          type="button"
          className="primary wide"
          onClick={armTimers}
          disabled={upcoming.length === 0}
        >
          {armed
            ? `✓ ${upcoming.length} timers set`
            : upcoming.length === 0
              ? 'This schedule is entirely in the past'
              : `Set ${upcoming.length} timers from this plan`}
        </button>
        <p className="hint">
          Replaces whatever is on the Timers tab. Only steps still ahead of you
          get a timer.
        </p>
      </Card>

      <Card title="Timeline">
        {days.map(([dayStart, steps]) => (
          <div key={dayStart} className="day">
            <h3 className="day-heading">{fmtDayHeading(dayStart, now)}</h3>
            <ol className="timeline">
              {steps.map((step) => {
                const isActive = active?.id === step.id
                const past = step.end < now
                const cls = [
                  'tl-item',
                  step.key === 'fold' ? 'fold' : '',
                  isActive ? 'active' : '',
                  past ? 'past' : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <li key={step.id} className={cls}>
                    <div className="tl-time">
                      <span>{fmtTime(step.start)}</span>
                      {step.timer ? (
                        <span className="tl-dur">
                          {fmtDuration(step.durationMin)}
                        </span>
                      ) : null}
                    </div>
                    <div className="tl-body">
                      <h4>
                        {step.title}
                        {step.tempAdjusted ? (
                          <span
                            className="badge"
                            title="Adjusted for your kitchen temperature"
                          >
                            temp
                          </span>
                        ) : null}
                      </h4>
                      {step.timer ? (
                        <p className="tl-until">until {fmtTime(step.end)}</p>
                      ) : null}
                      <p className="tl-detail">{step.detail}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        ))}
      </Card>

      <Card
        title="Adjust the plan"
        subtitle={`Defaults are a 75% country loaf in a ${formatTemp(REFERENCE_C, tempUnit)} kitchen.`}
      >
        <TempSlider />

        <Segmented
          label="Levain"
          value={plan.includeLevainBuild ? 'yes' : 'no'}
          onChange={(v) => patchPlan({ includeLevainBuild: v === 'yes' })}
          options={[
            { value: 'yes', label: 'Build it as part of the plan' },
            { value: 'no', label: 'Already have it ready' },
          ]}
        />

        {plan.includeLevainBuild ? (
          <div className="field">
            <div className="field-head">Levain ratio</div>
            <div className="ratio-chips">
              {RATIOS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={r.id === ratioId ? 'chip on' : 'chip'}
                  aria-pressed={r.id === ratioId}
                  onClick={() => setPrefs({ ratioId: r.id })}
                >
                  <span className="chip-label">{r.label}</span>
                  <span className="chip-sub">
                    {fmtDuration(r.peakHoursAt24C * 60)}
                  </span>
                </button>
              ))}
            </div>
            <p className="hint">
              Sets how long the levain build takes. Shared with the Starter
              tab, which explains what each ratio is for.
            </p>
          </div>
        ) : null}

        <Slider
          label="Autolyse"
          value={plan.autolyseMin}
          min={0}
          max={180}
          step={15}
          display={plan.autolyseMin === 0 ? 'skip' : fmtDuration(plan.autolyseMin)}
          onChange={(autolyseMin) => patchPlan({ autolyseMin })}
          hint="Flour and water alone. 30–60 minutes is plenty for white flour; wholegrain benefits from longer."
        />

        <Slider
          label={`Bulk fermentation at ${formatTemp(REFERENCE_C, tempUnit)}`}
          value={plan.bulkHours}
          min={2}
          max={10}
          step={0.5}
          display={fmtDuration(plan.bulkHours * 60)}
          onChange={(bulkHours) => patchPlan({ bulkHours })}
          hint="Scaled to your actual temperature in the timeline above. Shorten it if your starter is very active or your flour is weak."
        />

        <Stepper
          label="Stretch and fold sets"
          value={plan.foldSets}
          min={0}
          max={8}
          format={(v) => (v === 0 ? 'none' : `${v} sets`)}
          onChange={(foldSets) => patchPlan({ foldSets })}
        />

        <Slider
          label="Gap between fold sets"
          value={plan.foldIntervalMin}
          min={15}
          max={90}
          step={5}
          display={fmtDuration(plan.foldIntervalMin)}
          onChange={(foldIntervalMin) => patchPlan({ foldIntervalMin })}
          hint="Front-load the folds — all of them should be done within the first half of bulk."
        />

        <Slider
          label="Bench rest"
          value={plan.benchMin}
          min={5}
          max={60}
          step={5}
          display={fmtDuration(plan.benchMin)}
          onChange={(benchMin) => patchPlan({ benchMin })}
          hint="Between pre-shape and final shape. Longer for a slack dough that fights you."
        />

        <Slider
          label="Cold retard"
          value={plan.retardHours}
          min={0}
          max={48}
          step={1}
          display={
            plan.retardHours === 0
              ? 'same-day bake'
              : fmtDuration(plan.retardHours * 60)
          }
          onChange={(retardHours) => patchPlan({ retardHours })}
          hint={
            plan.retardHours === 0
              ? 'No fridge time: the loaf proofs at room temperature instead and you bake the same day. Faster, but less flavour and harder to score cleanly.'
              : '12–16 hours is the usual overnight. Up to about 48 hours keeps improving flavour; beyond that the structure starts to suffer.'
          }
        />

        {plan.retardHours === 0 ? (
          <Slider
            label={`Final proof at ${formatTemp(REFERENCE_C, tempUnit)}`}
            value={plan.finalProofHours}
            min={1}
            max={5}
            step={0.5}
            display={fmtDuration(plan.finalProofHours * 60)}
            onChange={(finalProofHours) => patchPlan({ finalProofHours })}
            hint="Room-temperature proof after shaping, scaled to your kitchen. Poke it: a dent that fills in slowly is ready."
          />
        ) : null}

        <Slider
          label="Oven preheat"
          value={plan.preheatMin}
          min={20}
          max={90}
          step={5}
          display={fmtDuration(plan.preheatMin)}
          onChange={(preheatMin) => patchPlan({ preheatMin })}
          hint="Overlaps the end of the retard, so it does not lengthen the plan. Cast iron genuinely needs 45–60 minutes."
        />

        <div className="two-up">
          <Slider
            label="Bake, lid on"
            value={plan.bakeLidOnMin}
            min={10}
            max={35}
            display={fmtDuration(plan.bakeLidOnMin)}
            onChange={(bakeLidOnMin) => patchPlan({ bakeLidOnMin })}
          />
          <Slider
            label="Bake, lid off"
            value={plan.bakeLidOffMin}
            min={5}
            max={40}
            display={fmtDuration(plan.bakeLidOffMin)}
            onChange={(bakeLidOffMin) => patchPlan({ bakeLidOffMin })}
          />
        </div>

        <Slider
          label="Cooling"
          value={plan.coolMin}
          min={30}
          max={300}
          step={15}
          display={fmtDuration(plan.coolMin)}
          onChange={(coolMin) => patchPlan({ coolMin })}
          hint="Two hours minimum. Cutting into a warm loaf is the most common way to get a gummy crumb."
        />

        <button
          type="button"
          className="ghost wide"
          onClick={() => setPlan(DEFAULT_PLAN)}
        >
          Reset to defaults
        </button>
      </Card>

      <Card title="Reading the plan">
        <Details summary="Why the timeline may not match your dough">
          <p>
            Every duration here is a starting estimate scaled from{' '}
            {formatTemp(REFERENCE_C, tempUnit)}. Real
            dough varies with the strength of your starter, the protein in your
            flour, how much wholegrain is in it, and how warm your hands are.
          </p>
          <p>
            Use the schedule to plan your day, and the dough itself to make the
            call. Bulk is done when it has grown by half to three-quarters, domes
            when you tilt the bowl, and shows bubbles at the edges — whatever the
            clock says.
          </p>
        </Details>
        <Details summary="The preheat overlaps the fridge time">
          <p>
            The oven goes on while the loaf is still in the fridge, so the pot is
            saturated the moment the dough comes out. That is why turning the
            preheat up does not push your bake time back.
          </p>
        </Details>
      </Card>
    </div>
  )
}
