import { fmtCountdown, fmtDuration, fmtTime } from '../lib/format'
import { useStore } from '../hooks'
import {
  adjustStep,
  bakeStore,
  endStepNow,
  isShiftableStep,
} from '../lib/bake'
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

export function TimerCard({
  timer,
  now,
  isLiveStep = false,
}: {
  timer: Timer
  now: number
  /** True only for the step currently under way. */
  isLiveStep?: boolean
}) {
  const bake = useStore(bakeStore)
  const left = remaining(timer, now)
  const finished = isFinished(timer, now)
  const paused = isPaused(timer)
  const overdue = finished && !timer.dismissed

  /*
   * A schedule timer is a view of a step, so editing it directly would desync
   * it from the bake and be silently undone by the next re-arm. Bake timers
   * therefore never get the plain per-timer controls.
   *
   * Only steps whose alert sits at their *end* can be shifted from here, since
   * that is the only case where this timer's endsAt is the step's end. Folds
   * and the preheat announce their start, and a fold is momentary anyway —
   * being late to one moves nothing downstream. They get no time controls
   * rather than buttons that would quietly do nothing.
   */
  const stepKey = timer.stepKey
  const isBakeTimer = bake !== null && timer.source === 'bake'
  const controlsBake =
    isBakeTimer && isShiftableStep(stepKey) && isLiveStep

  const doneEarly = () => {
    if (!controlsBake || !isShiftableStep(stepKey) || timer.endsAt === null) return
    const end = timer.endsAt
    bakeStore.set((prev) =>
      prev ? endStepNow(prev, stepKey, end, Date.now()) : prev,
    )
  }

  const nudgeBake = (deltaMin: number) => {
    if (!controlsBake || !isShiftableStep(stepKey)) return
    bakeStore.set((prev) => (prev ? adjustStep(prev, stepKey, deltaMin) : prev))
  }

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
            {controlsBake ? (
              <button type="button" onClick={() => nudgeBake(15)}>
                Needs 15m
              </button>
            ) : isBakeTimer ? null : (
              <>
                <button type="button" onClick={() => restartTimer(timer.id)}>
                  Restart
                </button>
                <button
                  type="button"
                  onClick={() => adjustTimer(timer.id, 15 * 60_000)}
                >
                  +15m
                </button>
              </>
            )}
          </>
        ) : controlsBake ? (
          <>
            <button type="button" className="primary" onClick={doneEarly}>
              Done early
            </button>
            <button type="button" onClick={() => nudgeBake(15)}>
              +15m
            </button>
          </>
        ) : isBakeTimer ? null : (
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
        {!isBakeTimer ? (
          <button
            type="button"
            className="ghost"
            aria-label={`Delete ${timer.label}`}
            onClick={() => removeTimer(timer.id)}
          >
            Delete
          </button>
        ) : null}
      </div>
      {controlsBake ? (
        <p className="timer-note">
          Part of your bake — these shift every later step too.
        </p>
      ) : null}
    </article>
  )
}
