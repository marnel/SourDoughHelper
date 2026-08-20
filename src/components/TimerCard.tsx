import { fmtCountdown, fmtDuration, fmtTime } from '../lib/format'
import {
  adjustTimer,
  dismissTimer,
  isFinished,
  isPaused,
  pauseTimer,
  progress,
  remaining,
  removeTimer,
  restartTimer,
  resumeTimer,
  type Timer,
} from '../lib/timers'

const RADIUS = 30
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function Ring({ value, overdue }: { value: number; overdue: boolean }) {
  return (
    <svg className="ring" viewBox="0 0 72 72" aria-hidden="true">
      <circle className="ring-track" cx="36" cy="36" r={RADIUS} />
      <circle
        className={overdue ? 'ring-fill overdue' : 'ring-fill'}
        cx="36"
        cy="36"
        r={RADIUS}
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - value)}
      />
    </svg>
  )
}

export function TimerCard({ timer, now }: { timer: Timer; now: number }) {
  const left = remaining(timer, now)
  const finished = isFinished(timer, now)
  const paused = isPaused(timer)
  const overdue = finished && !timer.dismissed

  return (
    <article className={overdue ? 'timer overdue' : 'timer'}>
      <div className="timer-main">
        <div className="timer-ring-wrap">
          <Ring value={progress(timer, now)} overdue={overdue} />
          <span className="timer-ring-label">
            {finished ? '✓' : fmtDuration(Math.ceil(left / 60_000))}
          </span>
        </div>

        <div className="timer-text">
          <h3>{timer.label}</h3>
          <p className="timer-clock">
            {finished ? (
              <>
                Due {fmtTime(timer.endsAt ?? now)}
                {left < -60_000
                  ? ` · ${fmtDuration(-left / 60_000)} ago`
                  : ' · now'}
              </>
            ) : paused ? (
              <>Paused · {fmtCountdown(left)} left</>
            ) : (
              <>
                {fmtCountdown(left)} · at {fmtTime(timer.endsAt ?? now)}
              </>
            )}
          </p>
          {timer.note ? <p className="timer-note">{timer.note}</p> : null}
        </div>
      </div>

      <div className="timer-actions">
        {finished ? (
          <>
            {!timer.dismissed ? (
              <button
                type="button"
                className="primary"
                onClick={() => dismissTimer(timer.id)}
              >
                Got it
              </button>
            ) : null}
            <button type="button" onClick={() => restartTimer(timer.id)}>
              Restart
            </button>
            <button type="button" onClick={() => adjustTimer(timer.id, 15 * 60_000)}>
              +15m
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() =>
                paused ? resumeTimer(timer.id) : pauseTimer(timer.id)
              }
            >
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button type="button" onClick={() => adjustTimer(timer.id, -5 * 60_000)}>
              −5m
            </button>
            <button type="button" onClick={() => adjustTimer(timer.id, 15 * 60_000)}>
              +15m
            </button>
          </>
        )}
        <button
          type="button"
          className="ghost"
          aria-label={`Delete ${timer.label}`}
          onClick={() => removeTimer(timer.id)}
        >
          Delete
        </button>
      </div>
    </article>
  )
}
