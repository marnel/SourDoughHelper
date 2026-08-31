import { useMemo } from 'react'
import { Card, Details, Slider, Stepper } from '../components/Controls'
import { usePersisted, usePrefs, useStore } from '../hooks'
import { fmtDuration } from '../lib/format'
import { formatTemp } from '../lib/temperature'
import { RATIOS, getRatio } from '../lib/ratios'
import {
  computeRecipe,
  grams,
  pct,
  perLoaf,
  recipeStore,
  type RecipeInput,
} from '../lib/recipe'
import {
  REFERENCE_LEVAIN_PCT,
  inoculationShiftMin,
  levainAdvice,
} from '../lib/inoculation'
import { setPrefs } from '../lib/prefs'
import { KEYS } from '../lib/storage'
import { buildSchedule, planStore } from '../lib/schedule'

export function MethodPage() {
  const r = useStore(recipeStore)
  // Loaf count only affects how the finished dough is divided, so it stays
  // local rather than joining the shared formula.
  const [loaves, setLoaves] = usePersisted<number>(KEYS.loaves, 1)
  const { tempUnit, ratioId, tempC } = usePrefs()
  // Read-only: the method text and its durations come from the saved plan, so
  // this page always agrees with the Plan tab.
  const plan = useStore(planStore)

  const recipe = useMemo(
    () => computeRecipe(r, ratioId, tempUnit),
    [r, ratioId, tempUnit],
  )
  const ratio = getRatio(ratioId)
  const patch = (p: Partial<RecipeInput>) =>
    recipeStore.set((prev) => ({ ...prev, ...p }))

  // Durations only — anchored anywhere, since this page shows lengths not clocks.
  const steps = useMemo(
    () =>
      buildSchedule({
        plan,
        ratioId,
        tempC,
        anchor: 'feed-starter',
        anchorAt: new Date(),
        levainPct: r.levainPct,
      }).steps,
    [plan, ratioId, tempC, r.levainPct],
  )

  // The same numbers the planner will use, so the two tabs cannot disagree.
  const bulkMinutes = steps.find((s) => s.key === 'bulk')?.durationMin ?? 0
  const shiftMin = inoculationShiftMin(r.levainPct)

  return (
    <div className="page">
      <Card
        title="Ingredients"
        subtitle="Baker's percentages, all relative to total flour."
      >
        <Slider
          label="Total flour"
          value={r.totalFlour}
          min={200}
          max={2000}
          step={50}
          display={grams(r.totalFlour)}
          onChange={(totalFlour) => patch({ totalFlour })}
          hint="Includes the flour inside your levain, which is why the flour you weigh out below is a little less."
        />

        <Slider
          label="Hydration"
          value={r.hydrationPct}
          min={55}
          max={95}
          display={`${r.hydrationPct}%`}
          onChange={(hydrationPct) => patch({ hydrationPct })}
          hint={
            r.hydrationPct < 68
              ? 'Easy to handle, tighter crumb. A good place to start.'
              : r.hydrationPct <= 80
                ? 'The usual range for an open-crumb country loaf.'
                : 'Very wet. Excellent crumb if your flour is strong and your shaping is confident.'
          }
        />

        <Slider
          label="Salt"
          value={r.saltPct}
          min={1}
          max={3}
          step={0.1}
          display={`${r.saltPct.toFixed(1)}%`}
          onChange={(saltPct) => patch({ saltPct })}
          hint="2% is standard. It controls fermentation as much as it seasons."
        />

        <Slider
          label="Levain"
          value={r.levainPct}
          min={5}
          max={40}
          step={1}
          display={`${r.levainPct}%`}
          onChange={(levainPct) => patch({ levainPct })}
          hint={
            <>
              <strong>{levainAdvice(r.levainPct).label}.</strong>{' '}
              {levainAdvice(r.levainPct).note}
            </>
          }
        />

        {/*
          The bulk time here is not advice to go and change a slider — the
          planner already accounts for this percentage. Showing it makes the
          connection between the two tabs visible.
        */}
        <p className="advice">
          At {r.levainPct}% the bulk works out to{' '}
          <strong>{fmtDuration(bulkMinutes)}</strong> in a{' '}
          {formatTemp(tempC, tempUnit)} kitchen
          {shiftMin !== 0 ? (
            <>
              {' '}
              — {fmtDuration(Math.abs(shiftMin))}{' '}
              {shiftMin > 0 ? 'longer' : 'shorter'} than at{' '}
              {REFERENCE_LEVAIN_PCT}%
            </>
          ) : null}
          . The Plan tab schedules around it.
        </p>

        <div className="field">
          <div className="field-head">Levain built at</div>
          <div className="ratio-chips">
            {RATIOS.map((x) => (
              <button
                key={x.id}
                type="button"
                className={x.id === ratioId ? 'chip on' : 'chip'}
                aria-pressed={x.id === ratioId}
                onClick={() => setPrefs({ ratioId: x.id })}
              >
                <span className="chip-label">{x.label}</span>
                <span className="chip-sub">{x.hydrationPct}% hyd</span>
              </button>
            ))}
          </div>
          <p className="hint">
            Only the levain's hydration matters here — a stiff levain carries
            less water, so you add more.
          </p>
        </div>

        <Stepper
          label="Split into"
          value={loaves}
          min={1}
          max={6}
          format={(v) => (v === 1 ? '1 loaf' : `${v} loaves`)}
          onChange={setLoaves}
        />

        <div className="mix-table">
          {recipe.lines.map((line) => (
            <div className="mix-row" key={line.name}>
              <span>
                {line.name}
                {line.note ? <em className="mix-note">{line.note}</em> : null}
              </span>
              <strong>
                {grams(line.grams)}
                {line.pct !== null ? (
                  <span className="mix-pct">{pct(line.pct)}</span>
                ) : null}
              </strong>
            </div>
          ))}
          <div className="mix-row total">
            <span>Total dough</span>
            <strong>{grams(recipe.totalDough)}</strong>
          </div>
          {loaves > 1 ? (
            <div className="mix-row">
              <span>Per loaf</span>
              <strong>{grams(perLoaf(recipe.totalDough, loaves))}</strong>
            </div>
          ) : null}
        </div>

        {recipe.warnings.length > 0 ? (
          <ul className="warnings">
            {recipe.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}

        <p className="hint">
          A {grams(perLoaf(recipe.totalDough, loaves))} loaf suits a standard
          Dutch oven or a 1 kg banneton. Around 900 g of dough is the classic
          bakery boule.
        </p>
      </Card>

      <Card
        title="Method"
        subtitle={`${ratio.label} levain, ${r.levainPct}% of the flour, ${fmtDuration(bulkMinutes)} bulk at ${formatTemp(tempC, tempUnit)}.`}
      >
        <ol className="method">
          {steps
            .filter((s) => s.key !== 'fold')
            .map((step, i) => (
              <li key={step.id}>
                <div className="method-head">
                  <span className="method-num">{i + 1}</span>
                  <h3>{step.title}</h3>
                  {step.timer ? (
                    <span className="method-dur">
                      {fmtDuration(step.durationMin)}
                    </span>
                  ) : (
                    <span className="method-dur hands-on">hands-on</span>
                  )}
                </div>
                <p>{step.detail}</p>
                {step.key === 'bulk' && plan.foldSets > 0 ? (
                  <p className="method-sub">
                    {plan.foldSets} sets of stretch and folds, every{' '}
                    {fmtDuration(plan.foldIntervalMin)}, starting{' '}
                    {fmtDuration(plan.foldIntervalMin)} after the mix. Stop
                    folding once the dough holds a dome.
                  </p>
                ) : null}
              </li>
            ))}
        </ol>
      </Card>

      <Card title="What you need">
        <ul className="kit">
          <li>
            <strong>Digital scale</strong> — non-negotiable. Everything here is
            by weight, and cups will not get you there.
          </li>
          <li>
            <strong>Dutch oven or combo cooker</strong> — traps steam, which is
            what gives you spring and a blistered crust.
          </li>
          <li>
            <strong>Banneton or a bowl and tea towel</strong> — for the final
            proof. Rice flour dusts better than wheat and stops sticking.
          </li>
          <li>
            <strong>Bench scraper</strong> — makes shaping a wet dough
            genuinely easier.
          </li>
          <li>
            <strong>Lame or a razor blade</strong> — a sharp knife works, but
            scores less cleanly.
          </li>
          <li>
            <strong>Thermometer</strong> — optional, but dough temperature is the
            variable that explains most surprises.
          </li>
        </ul>
      </Card>

      <Card title="When it goes wrong">
        <Details summary="Flat, dense, no rise">
          <p>
            Nearly always an under-strength levain or an under-fermented bulk.
            Check that your starter reliably triples and is used at peak, and
            look for real growth in the bulk rather than trusting the clock.
            Weak flour and too much wholegrain also cost you volume.
          </p>
        </Details>
        <Details summary="Spread out flat when turned out of the banneton">
          <p>
            Over-proofed, or under-shaped. If the dough was slack and full of
            large bubbles, cut the bulk short next time. If it felt fine but
            would not hold, work on building surface tension during the final
            shape and give it a longer bench rest.
          </p>
        </Details>
        <Details summary="Gummy or sticky crumb">
          <p>
            Usually cut too soon — give it the full cool. Otherwise it is
            under-baked; take it darker and check for 96–99°C / 205–210°F in the
            centre. A
            very wet dough with weak flour will also read gummy.
          </p>
        </Details>
        <Details summary="Huge holes near the crust, dense at the bottom">
          <p>
            Trapped gas from loose shaping, sometimes with an over-proofed
            surface. Degas more deliberately at pre-shape and shape tighter.
          </p>
        </Details>
        <Details summary="Too sour">
          <p>
            Shorten the cold retard, use the levain at its peak rather than
            past it, and feed the starter bigger meals — 1:5:5 or larger — for a
            few days beforehand. Warmer bulk favours the milder lactic acids;
            long cold time favours the sharp acetic ones.
          </p>
        </Details>
        <Details summary="Pale crust, no blisters">
          <p>
            Oven not hot enough, or preheat cut short. Get the pot to a full
            250°C / 480°F for 45–60 minutes, and give it a longer cold retard — the
            blisters come from a well-chilled, well-hydrated skin.
          </p>
        </Details>
      </Card>
    </div>
  )
}
