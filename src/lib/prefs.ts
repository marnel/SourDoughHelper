/**
 * App-wide preferences.
 *
 * A small shared store rather than per-page `usePersisted` state, because the
 * temperature unit and the theme are read from several pages at once. The
 * temperature unit in particular used to be duplicated on the Starter and Plan
 * pages, which meant switching it in one place left the other in the old unit.
 */

import { DEFAULT_RATIO_ID, RATIOS } from './ratios'
import { KEYS, load, save } from './storage'
import type { TempUnit } from './temperature'
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
}

export const DEFAULT_PREFS: Prefs = {
  palette: DEFAULT_PALETTE,
  mode: DEFAULT_MODE,
  // Fahrenheit by default; the unit toggle is in Settings.
  tempUnit: 'F',
  ratioId: DEFAULT_RATIO_ID,
}

function sanitise(p: Prefs): Prefs {
  return {
    palette: isPaletteId(p.palette) ? p.palette : DEFAULT_PREFS.palette,
    mode: isThemeMode(p.mode) ? p.mode : DEFAULT_PREFS.mode,
    tempUnit: p.tempUnit === 'C' || p.tempUnit === 'F' ? p.tempUnit : 'F',
    ratioId: RATIOS.some((r) => r.id === p.ratioId)
      ? p.ratioId
      : DEFAULT_PREFS.ratioId,
  }
}

/**
 * Read prefs, carrying a ratio chosen under the old per-page storage over to
 * the shared one so the fix does not silently reset someone's selection.
 *
 * Deliberately loads with an empty fallback rather than DEFAULT_PREFS: `load`
 * merges the fallback over the stored object, so against DEFAULT_PREFS a
 * missing `ratioId` would come back already filled in and the migration could
 * never detect it.
 */
function loadPrefs(): Prefs {
  const stored = load<Partial<Prefs>>(KEYS.prefs, {})
  const merged = { ...DEFAULT_PREFS, ...stored }
  if (stored.ratioId === undefined) {
    const legacy = load<{ ratioId?: string }>(KEYS.starter, {})
    if (legacy.ratioId) merged.ratioId = legacy.ratioId
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
