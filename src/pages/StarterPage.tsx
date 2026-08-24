import { useMemo, useState } from 'react'
import { Card, Details, Segmented, Slider } from '../components/Controls'
import { TempSlider } from '../components/TempSlider'
import { usePersisted, usePrefs } from '../hooks'
import { fmtDayTime, fmtDuration } from '../lib/format'
import { grams } from '../lib/recipe'
import {
  RATIOS,
  feedFromStarter,
  feedFromTotal,
  getRatio,
} from '../lib/ratios'
import { setPrefs } from '../lib/prefs'
import { KEYS } from '../lib/storage'
import { addTimer } from '../lib/timers'
import {
  REFERENCE_C,
  fermentFactor,
  formatTemp,
  formatTempDelta,
} from '../lib/temperature'

interface StarterState {
  mode: 'from-starter' | 'to-total'
  starterGrams: number
  totalGrams: number
  lastFedAt: number | null
}

const DEFAULT_STARTER: StarterState = {
  mode: 'from-starter',
  starterGrams: 20,
  totalGrams: 200,
  lastFedAt: null,
}

export function StarterPage() {
  const [s, setS] = usePersisted<StarterState>(KEYS.starter, DEFAULT_STARTER)
  const { tempUnit, ratioId, tempC } = usePrefs()
  const [expanded, setExpanded] = useState<string | null>(null)

  const ratio = getRatio(ratioId)
  const factor = fermentFactor(tempC)
  const peakMinutes = Math.round(ratio.peakHoursAt24C * 60 * factor)

  const feed = useMemo(
    () =>
      s.mode === 'from-starter'
        ? feedFromStarter(ratio, s.starterGrams)
        : feedFromTotal(ratio, s.totalGrams),
    [ratio, s.mode, s.starterGrams, s.totalGrams],
  )

  const patch = (p: Partial<StarterState>) => setS((prev) => ({ ...prev, ...p }))

  const feedNow = () => {
    const now = Date.now()
    patch({ lastFedAt: now })
    addTimer({
      label: 'Starter should be at peak',
      note: `Fed at ${ratio.label}. Look for a dome, a sweet-sour smell, and roughly ${ratio.flour / ratio.starter + 1}× growth.`,
      durationMs: peakMinutes * 60_000,
      stepKey: 'levain',
    })
  }

  return (
    <div className="page">
      <Card
        title="Feed the starter"
        subtitle="Pick a ratio, weigh it out, and know when it will peak."
      >
        <Segmented
          value={s.mode}
          onChange={(mode) => patch({ mode })}
          options={[
            { value: 'from-starter', label: 'I have this much starter' },
            { value: 'to-total', label: 'I need this much levain' },
          ]}
        />

        {s.mode === 'from-starter' ? (
          <Slider
            label="Starter in the jar"
            value={s.starterGrams}
            min={5}
            max={200}
            step={5}
            display={grams(s.starterGrams)}
            onChange={(starterGrams) => patch({ starterGrams })}
            hint="Whatever you are keeping back — the rest is discard."
          />
        ) : (
          <Slider
            label="Levain needed"
            value={s.totalGrams}
            min={50}
            max={1200}
            step={10}
            display={grams(s.totalGrams)}
            onChange={(totalGrams) => patch({ totalGrams })}
            hint="Build 10–20% more than the recipe asks for, so you have some left to keep."
          />
        )}

        <div className="ratio-chips" role="radiogroup" aria-label="Feeding ratio">
          {RATIOS.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={r.id === ratioId}
              className={r.id === ratioId ? 'chip on' : 'chip'}
              onClick={() => setPrefs({ ratioId: r.id })}
            >
              <span className="chip-label">{r.label}</span>
              <span className="chip-sub">
                {fmtDuration(r.peakHoursAt24C * 60 * factor)}
              </span>
            </button>
          ))}
        </div>

        <div className="mix-table">
          <div className="mix-row">
            <span>Starter</span>
            <strong>{grams(feed.starter)}</strong>
          </div>
          <div className="mix-row">
            <span>Flour</span>
            <strong>{grams(feed.flour)}</strong>
          </div>
          <div className="mix-row">
            <span>Water</span>
            <strong>{grams(feed.water)}</strong>
          </div>
          <div className="mix-row total">
            <span>Total</span>
            <strong>{grams(feed.total)}</strong>
          </div>
        </div>

        <p className="ratio-why">{ratio.summary}</p>

        <div className="peak-callout">
          <div>
            <span className="peak-label">Expected peak</span>
            <strong className="peak-value">{fmtDuration(peakMinutes)}</strong>
            <span className="peak-at">
              around {fmtDayTime(Date.now() + peakMinutes * 60_000)}
            </span>
          </div>
          <button type="button" className="primary" onClick={feedNow}>
            Fed it just now
          </button>
        </div>

        {s.lastFedAt ? (
          <p className="hint">
            Last fed {fmtDayTime(s.lastFedAt)} — that is{' '}
            {fmtDuration((Date.now() - s.lastFedAt) / 60_000)} ago.
          </p>
        ) : null}
      </Card>

      <Card
        title="Temperature"
        subtitle="The single biggest lever on how long anything takes."
      >
        <TempSlider />
        <p className="hint">
          Timings assume {formatTemp(REFERENCE_C, tempUnit)} and are scaled from
          there — activity roughly doubles for every{' '}
          {formatTempDelta(10, tempUnit)} warmer. At{' '}
          {formatTemp(tempC, tempUnit)} that works out to{' '}
          <strong>
            {factor === 1
              ? 'no change'
              : factor > 1
                ? `${factor.toFixed(2)}× longer`
                : `${(1 / factor).toFixed(2)}× faster`}
          </strong>
          .
        </p>
      </Card>

      <Card
        title="Which ratio, and why"
        subtitle="Starter : flour : water, by weight."
      >
        <div className="ratio-list">
          {RATIOS.map((r) => {
            const open = expanded === r.id
            return (
              <div key={r.id} className={open ? 'ratio-item open' : 'ratio-item'}>
                <button
                  type="button"
                  className="ratio-head"
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? null : r.id)}
                >
                  <span className="ratio-name">{r.label}</span>
                  <span className="ratio-peak">
                    peaks in {fmtDuration(r.peakHoursAt24C * 60)}
                  </span>
                  <span className="ratio-caret" aria-hidden="true">
                    {open ? '−' : '+'}
                  </span>
                </button>
                {open ? (
                  <div className="ratio-body">
                    <p className="ratio-summary">{r.summary}</p>
                    <h4>Good for</h4>
                    <ul>
                      {r.goodFor.map((g) => (
                        <li key={g}>{g}</li>
                      ))}
                    </ul>
                    <h4>Watch out</h4>
                    <p>{r.watchOut}</p>
                    <p className="hint">
                      Resulting starter hydration: {r.hydrationPct}%. At{' '}
                      {formatTemp(tempC, tempUnit)} expect a peak in about{' '}
                      {fmtDuration(r.peakHoursAt24C * 60 * factor)}.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setPrefs({ ratioId: r.id })
                        setExpanded(null)
                      }}
                    >
                      Use {r.label}
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        <Details summary="How do I know it has actually peaked?">
          <ul>
            <li>
              <strong>It has domed and is just starting to flatten.</strong> The
              flat top is the signal — past that it is on the way down.
            </li>
            <li>
              <strong>Marked and risen.</strong> An elastic band or a marker
              line on the jar beats guessing. Two to three times the starting
              height is healthy.
            </li>
            <li>
              <strong>It smells sweet and yoghurty</strong>, not sharp like
              vinegar or nail polish. Sharp means you are late, or the ratio is
              too small a meal.
            </li>
            <li>
              <strong>Bubbles through the body</strong>, not just on the
              surface, and it pulls in strands when you spoon it out.
            </li>
            <li>
              The float test works but is not definitive — a peaked stiff levain
              often sinks and is perfectly good.
            </li>
          </ul>
        </Details>

        <Details summary="Keeping it in the fridge">
          <p>
            A fridge starter is fed once a week or so. Take it out, discard down
            to 20 g, feed at 1:2:2 or 1:3:3, let it peak fully on the counter,
            then put it back. It will be sluggish for the first bake after a
            long sleep — give it two feeds before you rely on it.
          </p>
          <p>
            Grey liquid on top (hooch) means it is hungry, not dead. Pour it off
            for a milder starter, stir it in for a tangier one, and feed sooner
            next time.
          </p>
        </Details>

        <Details summary="Fixing a starter that has gone sour or sluggish">
          <ul>
            <li>
              <strong>Too sour or vinegary:</strong> feed bigger and more often.
              Two or three feeds at 1:5:5 or 1:10:10, caught at peak each time,
              will mellow it noticeably.
            </li>
            <li>
              <strong>Rises weakly:</strong> it is usually cold, not sick. Find
              somewhere 24–26°C / 75–79°F and feed at 1:2:2 twice a day for three
              days.
            </li>
            <li>
              <strong>Rises then collapses fast:</strong> healthy but
              under-fed — step up to a bigger ratio so the peak lasts longer.
            </li>
            <li>
              <strong>Smells like acetone:</strong> badly overdue. Discard all
              but a teaspoon, feed at 1:10:10, and repeat daily.
            </li>
            <li>
              A little wholemeal or rye in the feed — 10–20% — reliably wakes up
              a lazy culture.
            </li>
          </ul>
        </Details>
      </Card>
    </div>
  )
}
