/**
 * Theme handling.
 *
 * The colour work lives entirely in CSS: each palette declares its light and
 * dark values as `--l-*` / `--d-*` custom properties under a
 * `[data-palette="…"]` selector, and one shared mapping block resolves those
 * into the `--bg` / `--ink` / `--accent` tokens the rest of the stylesheet
 * uses. So this module only has to set two attributes on <html>.
 *
 * A useful consequence: any element can carry `data-palette` and `data-theme`
 * and it re-maps for its own subtree. That is how the swatches in the settings
 * sheet preview a palette without duplicating a single colour value in JS.
 */

export type PaletteId = 'slate' | 'crust' | 'sage'
export type ThemeMode = 'system' | 'light' | 'dark'

export interface Palette {
  id: PaletteId
  name: string
  description: string
}

export const PALETTES: Palette[] = [
  {
    id: 'slate',
    name: 'Slate',
    description: 'Cool neutral greys with a clear blue. Crisp and easy to read.',
  },
  {
    id: 'crust',
    name: 'Crust',
    description: 'Warm cream and terracotta. Looks like the thing you are baking.',
  },
  {
    id: 'sage',
    name: 'Sage',
    description: 'Soft greens with a deep forest accent. Calm and low-glare.',
  },
]

export const DEFAULT_PALETTE: PaletteId = 'slate'
export const DEFAULT_MODE: ThemeMode = 'system'

export const MODE_LABELS: Record<ThemeMode, string> = {
  system: 'Automatic',
  light: 'Light',
  dark: 'Dark',
}

export function isPaletteId(value: unknown): value is PaletteId {
  return PALETTES.some((p) => p.id === value)
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

/** What `system` currently resolves to. */
export function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/**
 * Keeps the browser UI (address bar, status bar in an installed app) matching
 * the palette. Read back from the live CSS so there is one source of truth.
 */
function syncThemeColor(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) return
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue('--bg')
    .trim()
  if (bg) meta.setAttribute('content', bg)
}

export function applyTheme(palette: PaletteId, mode: ThemeMode): void {
  const root = document.documentElement
  root.dataset.palette = palette
  if (mode === 'system') {
    // Leaving the attribute off lets the prefers-color-scheme block decide.
    delete root.dataset.theme
  } else {
    root.dataset.theme = mode
  }
  syncThemeColor()
}

/**
 * Re-sync the browser chrome when the OS flips light/dark while we are on
 * `system`. Returns a cleanup function.
 */
export function watchSystemTheme(onChange: () => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => {
    syncThemeColor()
    onChange()
  }
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}
