/**
 * App-wide preferences.
 *
 * A small shared store rather than per-page `usePersisted` state, because the
 * temperature unit and the theme are read from several pages at once. The
 * temperature unit in particular used to be duplicated on the Starter and Plan
 * pages, which meant switching it in one place left the other in the old unit.
 */

import { DEFAULT_RATIO_ID, RATIOS } from './ratios'
import { DEFAULT_RECIPE } from './recipe'
import { KEYS, load, save } from './storage'
import { REFERENCE_C, type TempUnit } from './temperature'
import {
  DEFAULT_MODE,
  DEFAULT_PALETTE,
  applyTheme,
  isPaletteId,
  isThemeMode,
  type PaletteId,
  type ThemeMode,
} from './theme'

export interface Prefs {
  palette: PaletteId
  mode: ThemeMode
  tempUnit: TempUnit
  /**
   * The feeding ratio, shared by the whole app.
   *
   * This lives here rather than on each page because it used to be stored
   * three times — once for the Starter tab, once for the Plan tab and once for
   * the Method tab — all defaulting to 1:2:2 and never syncing. Choosing
   * 1:10:10 on the Starter tab left the planner still building a 1:2:2 levain
   * and quietly scheduling the bake eight hours too late.
   */
  ratioId: string
  /**
   * Kitchen temperature in °C, shared by the whole app.
   *
   * Same reasoning as ratioId: this was stored twice — once for the starter
   * jar, once for the dough — so the Starter tab could say a 1:2:2 levain
   * peaks in 4h 5m while the planner scheduled a 5h 30m build for the same
   * levain. One number, even if imperfect, beats two that contradict.
   */
  tempC: number
  /**
   * The baker's house formula. The recipe itself already persists, so these
   * exist for the other direction: getting back to your usual numbers after
   * an experiment, without having to remember what they were.
   *
   * Batch size is deliberately not included — flour weight and loaf count
   * change from bake to bake, while a formula does not.
   */
  recipeDefaults: RecipeDefaults
}

export interface RecipeDefaults {
  hydrationPct: number
  saltPct: number
  levainPct: number
}

export const DEFAULT_PREFS: Prefs = {
  palette: DEFAULT_PALETTE,
  mode: DEFAULT_MODE,
  // Fahrenheit by default; the unit toggle is in Settings.
  tempUnit: 'F',
  ratioId: DEFAULT_RATIO_ID,
  tempC: REFERENCE_C,
  recipeDefaults: {
    hydrationPct: DEFAULT_RECIPE.hydrationPct,
    saltPct: DEFAULT_RECIPE.saltPct,
    levainPct: DEFAULT_RECIPE.levainPct,
  },
}

function sanitise(p: Prefs): Prefs {
  return {
    palette: isPaletteId(p.palette) ? p.palette : DEFAULT_PREFS.palette,
    mode: isThemeMode(p.mode) ? p.mode : DEFAULT_PREFS.mode,
    tempUnit: p.tempUnit === 'C' || p.tempUnit === 'F' ? p.tempUnit : 'F',
    ratioId: RATIOS.some((r) => r.id === p.ratioId)
      ? p.ratioId
      : DEFAULT_PREFS.ratioId,
    // Clamp to the slider's range so a corrupt value cannot produce a
    // nonsense schedule.
    tempC:
      Number.isFinite(p.tempC) && p.tempC >= 10 && p.tempC <= 40
        ? p.tempC
        : DEFAULT_PREFS.tempC,
    recipeDefaults: sanitiseDefaults(p.recipeDefaults),
  }
}

/**
 * `load` merges shallowly, so a stored object with only one of the three
 * fields would otherwise replace the whole default. Each field is filled and
 * clamped to its slider's range individually.
 */
function sanitiseDefaults(d: Partial<RecipeDefaults> | undefined): RecipeDefaults {
  const base = DEFAULT_PREFS.recipeDefaults
  const clamp = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.min(max, Math.max(min, v))
      : fallback
  return {
    hydrationPct: clamp(d?.hydrationPct, 55, 95, base.hydrationPct),
    saltPct: clamp(d?.saltPct, 1, 3, base.saltPct),
    levainPct: clamp(d?.levainPct, 5, 40, base.levainPct),
  }
}

/**
 * Read prefs, carrying a ratio and temperature chosen under the old per-page
 * storage over to the shared ones, so the fix does not silently reset
 * someone's selections.
 *
 * Deliberately loads with an empty fallback rather than DEFAULT_PREFS: `load`
 * merges the fallback over the stored object, so against DEFAULT_PREFS a
 * missing `ratioId` would come back already filled in and the migration could
 * never detect it.
 */
function loadPrefs(): Prefs {
  const stored = load<Partial<Prefs>>(KEYS.prefs, {})
  const merged = { ...DEFAULT_PREFS, ...stored }
  if (stored.ratioId === undefined || stored.tempC === undefined) {
    const legacyStarter = load<{ ratioId?: string; tempC?: number }>(
      KEYS.starter,
      {},
    )
    if (stored.ratioId === undefined && legacyStarter.ratioId) {
      merged.ratioId = legacyStarter.ratioId
    }
    if (stored.tempC === undefined) {
      // Prefer the plan's value: it drove bulk, bench and the final proof,
      // so it is the one that shaped the actual bake.
      const legacyPlan = load<{ doughTempC?: number }>(KEYS.plan, {})
      const inherited = legacyPlan.doughTempC ?? legacyStarter.tempC
      if (inherited !== undefined) merged.tempC = inherited
    }
  }
  return sanitise(merged)
}

let prefs: Prefs = loadPrefs()

const listeners = new Set<() => void>()

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getPrefs(): Prefs {
  return prefs
}

export function setPrefs(patch: Partial<Prefs>): void {
  prefs = sanitise({ ...prefs, ...patch })
  save(KEYS.prefs, prefs)
  if (patch.palette !== undefined || patch.mode !== undefined) {
    applyTheme(prefs.palette, prefs.mode)
  }
  listeners.forEach((l) => l())
}

/**
 * Push the stored theme onto <html> at startup. The inline script in
 * index.html has usually done this already to avoid a flash of the wrong
 * colours; this makes it correct even if that script was skipped.
 */
export function initTheme(): void {
  applyTheme(prefs.palette, prefs.mode)
}
