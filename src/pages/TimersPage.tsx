import { useEffect, useState } from 'react'
import { Card, Details } from '../components/Controls'
import { TimerCard } from '../components/TimerCard'
import { useNow, useTimers } from '../hooks'
import { fmtDuration } from '../lib/format'
import {
  addTimer,
  clearAll,
  clearFinished,
  isFinished,
  remaining,
} from '../lib/timers'
import {
  needsInstallForAlerts,
  notifyState,
  primeAudio,
  requestNotifyPermission,
  type NotifyState,
} from '../lib/notify'

const PRESETS: Array<{ label: string; minutes: number; note: string }> = [
  {
    label: 'Stretch & fold',
    minutes: 30,
    note: 'Four lifts and folds, quarter-turning the bowl between each.',
  },
  { label: 'Autolyse', minutes: 45, note: 'Flour and water only, covered.' },
  {
    label: 'Bench rest',
    minutes: 25,
    note: 'Uncovered, after pre-shaping. It should relax and spread slightly.',
  },
  {
    label: 'Bulk ferment',
    minutes: 300,
    note: 'Check for 50–75% growth, a domed surface and bubbles at the edge.',
  },
  {
    label: 'Cold retard',
    minutes: 14 * 60,
    note: 'In the fridge, seam-side up in the banneton.',
  },
  { label: 'Preheat', minutes: 55, note: 'Dutch oven inside, lid on, 250°C / 480°F.' },
  {
    label: 'Bake — lid on',
    minutes: 20,
    note: '250°C / 480°F. Do not open it; the steam is doing the work.',
  },
  {
    label: 'Bake — lid off',
    minutes: 22,
    note: 'Drop to 230°C / 450°F and take it dark.',
  },
  {
    label: 'Cool',
    minutes: 120,
    note: 'On a rack. Resist cutting into it early.',
  },
]

export function TimersPage() {
  const now = useNow(1000)
  const timers = useTimers()
  const [perm, setPerm] = useState<NotifyState>(() => notifyState())
  const [custom, setCustom] = useState({ label: '', minutes: 30 })

  useEffect(() => {
    setPerm(notifyState())
  }, [timers.length])

  const finished = timers.filter((t) => isFinished(t, now) && !t.dismissed)
  const running = timers
    .filter((t) => !isFinished(t, now))
    .sort((a, b) => remaining(a, now) - remaining(b, now))
  const done = timers.filter((t) => isFinished(t, now) && t.dismissed)

  const enableAlerts = async () => {
    primeAudio()
    setPerm(await requestNotifyPermission())
  }

  return (
    <div className="page">
      {perm !== 'granted' ? (
        <Card tone="accent">
          <div className="alert-cta">
            <div>
              <h2>Turn on alerts</h2>
              <p>
                {perm === 'denied'
                  ? 'Notifications are blocked for this site. Re-enable them in your browser settings if you want to be told when a step is due.'
                  : perm === 'unsupported'
                    ? 'This browser does not support notifications. Timers still keep perfect time — you will just need to check back.'
                    : 'Get a notification, a chime and a buzz the moment a step comes due.'}
              </p>
              {needsInstallForAlerts() ? (
                <p className="hint">
                  On iPhone or iPad, add this app to your home screen first —
                  Safari only allows notifications from installed apps.
                </p>
              ) : null}
            </div>
            {perm === 'default' ? (
              <button type="button" className="primary" onClick={enableAlerts}>
                Enable
              </button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {finished.length > 0 ? (
        <Card title={finished.length === 1 ? 'Due now' : `${finished.length} due now`}>
          <div className="timer-list">
            {finished.map((t) => (
              <TimerCard key={t.id} timer={t} now={now} />
            ))}
          </div>
        </Card>
      ) : null}

      <Card
        title={running.length > 0 ? 'Running' : 'No timers running'}
        subtitle={
          running.length > 0
            ? `Next in ${fmtDuration(remaining(running[0]!, now) / 60_000)}.`
            : 'Add one below, or set a whole batch from the Plan tab.'
        }
      >
        {running.length > 0 ? (
          <div className="timer-list">
            {running.map((t) => (
              <TimerCard key={t.id} timer={t} now={now} />
            ))}
          </div>
        ) : null}
      </Card>

      <Card title="Quick add">
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="preset"
              onClick={() => {
                primeAudio()
                addTimer({
                  label: p.label,
                  note: p.note,
                  durationMs: p.minutes * 60_000,
                })
              }}
            >
              <span className="preset-label">{p.label}</span>
              <span className="preset-dur">{fmtDuration(p.minutes)}</span>
            </button>
          ))}
        </div>

        <form
          className="custom-timer"
          onSubmit={(e) => {
            e.preventDefault()
            if (custom.minutes <= 0) return
            primeAudio()
            addTimer({
              label: custom.label.trim() || `${fmtDuration(custom.minutes)} timer`,
              durationMs: custom.minutes * 60_000,
            })
            setCustom({ label: '', minutes: 30 })
          }}
        >
          <input
            type="text"
            placeholder="Custom timer name"
            value={custom.label}
            onChange={(e) => setCustom((c) => ({ ...c, label: e.target.value }))}
            aria-label="Custom timer name"
          />
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={4320}
            value={custom.minutes}
            onChange={(e) =>
              setCustom((c) => ({ ...c, minutes: Number(e.target.value) }))
            }
            aria-label="Minutes"
          />
          <button type="submit" className="primary">
            Add
          </button>
        </form>
      </Card>

      {done.length > 0 ? (
        <Card title="Finished">
          <div className="timer-list">
            {done.map((t) => (
              <TimerCard key={t.id} timer={t} now={now} />
            ))}
          </div>
        </Card>
      ) : null}

      {timers.length > 0 ? (
        <div className="row-actions">
          <button type="button" className="ghost" onClick={clearFinished}>
            Clear finished
          </button>
          <button type="button" className="ghost" onClick={clearAll}>
            Clear all
          </button>
        </div>
      ) : null}

      <Card title="How alerts work">
        <Details summary="Will it wake me up overnight?">
          <p>
            Honestly: not reliably, and it is worth knowing why. Waking a phone
            from a fully closed app needs a push server, and this app has no
            server — everything runs on your device.
          </p>
          <p>What does work:</p>
          <ul>
            <li>
              <strong>App open:</strong> chime, vibration and an on-screen alert.
            </li>
            <li>
              <strong>App in the background:</strong> a system notification,
              usually within a minute of the due time.
            </li>
            <li>
              <strong>App fully closed:</strong> nothing fires, but nothing is
              lost either — timers are stored as real clock times, so opening the
              app shows exactly what came due and how long ago.
            </li>
          </ul>
          <p>
            For an overnight retard, set an alarm in your phone's clock app as
            well. For anything during the day, leave this open in a tab or keep
            the app on screen and it will tell you.
          </p>
        </Details>
        <Details summary="Timers keep counting when the app is closed">
          <p>
            Each timer remembers the moment it is due rather than counting down.
            Lock the phone, restart the browser, come back six hours later — the
            remaining time is still correct, and anything overdue is shown as
            overdue with how late it is.
          </p>
        </Details>
      </Card>
    </div>
  )
}
