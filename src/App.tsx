import { useEffect, useMemo, useState } from 'react'
import {
  useNow,
  usePrefs,
  useRoute,
  useStore,
  useTimers,
  type Route,
} from './hooks'
import { fmtCountdown } from './lib/format'
import { bakeStore, bakeTimersFor } from './lib/bake'
import { buildSchedule, planStore } from './lib/schedule'
import { recipeStore } from './lib/recipe'
import { isFinished, remaining, replaceBakeTimers, startClock } from './lib/timers'
import { primeAudio } from './lib/notify'
import { initTheme } from './lib/prefs'
import { resolveMode, watchSystemTheme } from './lib/theme'
import { SettingsSheet } from './components/SettingsSheet'
import { MethodPage } from './pages/MethodPage'
import { PlanPage } from './pages/PlanPage'
import { StarterPage } from './pages/StarterPage'
import { TimersPage } from './pages/TimersPage'

/*
 * Ordered as the bake actually runs: feed the starter, work out the formula
 * and the steps, schedule it, then run the timers.
 */
const TABS: Array<{ route: Route; label: string; icon: string }> = [
  { route: 'starter', label: 'Starter', icon: '🫙' },
  { route: 'method', label: 'Method', icon: '🍞' },
  { route: 'plan', label: 'Plan', icon: '🗓' },
  { route: 'timers', label: 'Timers', icon: '⏱' },
]

const TITLES: Record<Route, string> = {
  starter: 'Starter',
  plan: 'Plan a bake',
  timers: 'Timers',
  method: 'Recipe & method',
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function App() {
  const [route, navigate] = useRoute()
  const now = useNow(1000)
  const timers = useTimers()
  const prefs = usePrefs()
  const plan = useStore(planStore)
  const bake = useStore(bakeStore)
  const recipe = useStore(recipeStore)
  const [install, setInstall] = useState<InstallPromptEvent | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Re-render on an OS light/dark flip so the swatch previews follow along.
  const [, setSystemTick] = useState(0)

  // One clock drives every timer in the app.
  useEffect(() => startClock(), [])

  useEffect(() => {
    initTheme()
    return watchSystemTheme(() => setSystemTick((n) => n + 1))
  }, [])

  const resolvedMode = resolveMode(prefs.mode)

  /*
   * Re-timing a running bake lives here rather than on the Plan tab, because
   * only one route is mounted at a time and steps are most often marked done
   * from the Timers tab. Ad-hoc timers are untouched; only the plan's own are
   * replaced.
   */
  const bakeSchedule = useMemo(
    () =>
      bake
        ? buildSchedule({
            plan,
            ratioId: prefs.ratioId,
            tempC: prefs.tempC,
            anchor: 'feed-starter',
            anchorAt: new Date(bake.startedAt),
            adjustments: bake.adjustments,
            levainPct: recipe.levainPct,
            blend: {
              wholemealPct: recipe.wholemealPct ?? 0,
              ryePct: recipe.ryePct ?? 0,
            },
          })
        : null,
    [
      bake,
      plan,
      prefs.ratioId,
      prefs.tempC,
      recipe.levainPct,
      recipe.wholemealPct,
      recipe.ryePct,
    ],
  )

  useEffect(() => {
    if (!bakeSchedule) return
    replaceBakeTimers(bakeTimersFor(bakeSchedule, Date.now()))
  }, [bakeSchedule])

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstall(e as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', () => setInstall(null))
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  // Scroll to the top when switching tabs — otherwise a long Plan page leaves
  // you halfway down the next one.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [route])

  const overdue = timers.filter((t) => isFinished(t, now) && !t.dismissed)
  const next = timers
    .filter((t) => !isFinished(t, now) && t.endsAt !== null)
    .sort((a, b) => remaining(a, now) - remaining(b, now))[0]

  return (
    <div className="app" onPointerDownCapture={primeAudio}>
      <header className="topbar">
        <div className="topbar-row">
          <h1>{TITLES[route]}</h1>
          {install ? (
            <button
              type="button"
              className="install"
              onClick={async () => {
                await install.prompt()
                setInstall(null)
              }}
            >
              Install
            </button>
          ) : null}
          <button
            type="button"
            className="gear"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            ⚙
          </button>
        </div>

        {overdue.length > 0 ? (
          <button
            type="button"
            className="strip due"
            onClick={() => navigate('timers')}
          >
            <span className="strip-dot" aria-hidden="true" />
            <span className="strip-label">
              {overdue.length === 1
                ? overdue[0]!.label
                : `${overdue.length} steps due`}
            </span>
            <span className="strip-time">now</span>
          </button>
        ) : next ? (
          <button
            type="button"
            className="strip"
            onClick={() => navigate('timers')}
          >
            <span className="strip-label">{next.label}</span>
            <span className="strip-time">
              {fmtCountdown(remaining(next, now))}
            </span>
          </button>
        ) : null}
      </header>

      <main>
        {route === 'starter' ? <StarterPage /> : null}
        {route === 'plan' ? <PlanPage /> : null}
        {route === 'timers' ? <TimersPage /> : null}
        {route === 'method' ? <MethodPage /> : null}
      </main>

      <nav className="tabbar" aria-label="Sections">
        {TABS.map((t) => {
          const on = t.route === route
          const badge = t.route === 'timers' ? overdue.length : 0
          return (
            <button
              key={t.route}
              type="button"
              className={on ? 'tab on' : 'tab'}
              aria-current={on ? 'page' : undefined}
              onClick={() => navigate(t.route)}
            >
              <span className="tab-icon" aria-hidden="true">
                {t.icon}
              </span>
              <span className="tab-label">{t.label}</span>
              {badge > 0 ? <span className="tab-badge">{badge}</span> : null}
            </button>
          )
        })}
      </nav>

      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        resolvedMode={resolvedMode}
      />
    </div>
  )
}
