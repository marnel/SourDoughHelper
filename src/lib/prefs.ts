/**
 * App-wide preferences.
 *
 * A small shared store rather than per-page `usePersisted` state, because the
 * temperature unit and the theme are read from several pages at once. The
 * temperature unit in particular used to be duplicated on the Starter and Plan
 * pages, which meant switching it in one place left the other in the old unit.
 */

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
}

export const DEFAULT_PREFS: Prefs = {
  palette: DEFAULT_PALETTE,
  mode: DEFAULT_MODE,
  // Fahrenheit by default; the unit toggle is in Settings.
  tempUnit: 'F',
}

function sanitise(p: Prefs): Prefs {
  return {
    palette: isPaletteId(p.palette) ? p.palette : DEFAULT_PREFS.palette,
    mode: isThemeMode(p.mode) ? p.mode : DEFAULT_PREFS.mode,
    tempUnit: p.tempUnit === 'C' || p.tempUnit === 'F' ? p.tempUnit : 'F',
  }
}

let prefs: Prefs = sanitise(load<Prefs>(KEYS.prefs, DEFAULT_PREFS))

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
