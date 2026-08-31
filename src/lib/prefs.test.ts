// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Prefs are read once at module load, so each case seeds localStorage and then
 * re-imports the module to exercise the real startup path — including the
 * migration off the old per-page storage.
 */
async function loadPrefs(seed: Record<string, unknown> = {}) {
  localStorage.clear()
  for (const [key, value] of Object.entries(seed)) {
    localStorage.setItem(`sdhelper:v1:${key}`, JSON.stringify(value))
  }
  vi.resetModules()
  return import('./prefs')
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-palette')
})

describe('defaults', () => {
  it('starts on Slate, following the system, in Fahrenheit', async () => {
    const { getPrefs } = await loadPrefs()
    expect(getPrefs()).toMatchObject({
      palette: 'slate',
      mode: 'system',
      tempUnit: 'F',
      ratioId: '1-2-2',
      tempC: 24,
    })
  })
})

describe('validation', () => {
  it('falls back on values it does not recognise', async () => {
    const { getPrefs } = await loadPrefs({
      prefs: {
        palette: 'chartreuse',
        mode: 'strobe',
        tempUnit: 'K',
        ratioId: '1-99-99',
      },
    })
    expect(getPrefs()).toMatchObject({
      palette: 'slate',
      mode: 'system',
      tempUnit: 'F',
      ratioId: '1-2-2',
    })
  })

  it('rejects a temperature outside the slider’s range', async () => {
    for (const tempC of [-40, 5, 60, NaN, 'hot']) {
      const { getPrefs } = await loadPrefs({ prefs: { tempC } })
      expect(getPrefs().tempC).toBe(24)
    }
  })

  it('keeps valid stored values', async () => {
    const { getPrefs } = await loadPrefs({
      prefs: {
        palette: 'sage',
        mode: 'dark',
        tempUnit: 'C',
        ratioId: '1-5-5',
        tempC: 28,
      },
    })
    expect(getPrefs()).toMatchObject({
      palette: 'sage',
      mode: 'dark',
      tempUnit: 'C',
      ratioId: '1-5-5',
      tempC: 28,
    })
  })
})

/*
 * The ratio and the temperature used to be stored per page, which let the
 * Starter tab and the planner disagree. Unifying them must not silently reset
 * a selection someone had already made.
 */
describe('migration off the old per-page storage', () => {
  it('adopts a ratio chosen on the old Starter tab', async () => {
    const { getPrefs } = await loadPrefs({ starter: { ratioId: '1-10-10' } })
    expect(getPrefs().ratioId).toBe('1-10-10')
  })

  it('prefers the plan’s temperature, which drove the actual bake', async () => {
    const { getPrefs } = await loadPrefs({
      starter: { tempC: 28 },
      plan: { doughTempC: 18 },
    })
    expect(getPrefs().tempC).toBe(18)
  })

  it('falls back to the starter’s temperature when the plan has none', async () => {
    const { getPrefs } = await loadPrefs({ starter: { tempC: 28 } })
    expect(getPrefs().tempC).toBe(28)
  })

  it('does not override a value already saved in prefs', async () => {
    const { getPrefs } = await loadPrefs({
      prefs: { ratioId: '1-3-3', tempC: 22 },
      starter: { ratioId: '1-10-10', tempC: 30 },
    })
    expect(getPrefs().ratioId).toBe('1-3-3')
    expect(getPrefs().tempC).toBe(22)
  })

  it('still validates what it migrates', async () => {
    const { getPrefs } = await loadPrefs({ starter: { ratioId: 'bogus' } })
    expect(getPrefs().ratioId).toBe('1-2-2')
  })
})

describe('setPrefs', () => {
  it('merges a partial update and notifies subscribers', async () => {
    const { getPrefs, setPrefs, subscribe } = await loadPrefs()
    const listener = vi.fn()
    subscribe(listener)
    setPrefs({ tempUnit: 'C' })
    expect(getPrefs().tempUnit).toBe('C')
    expect(getPrefs().palette).toBe('slate')
    expect(listener).toHaveBeenCalled()
  })

  it('persists across a reload', async () => {
    const { setPrefs } = await loadPrefs()
    setPrefs({ ratioId: '1-4-4', tempC: 20 })
    vi.resetModules()
    const { getPrefs } = await import('./prefs')
    expect(getPrefs()).toMatchObject({ ratioId: '1-4-4', tempC: 20 })
  })

  it('applies the theme to the document when the palette changes', async () => {
    const { setPrefs } = await loadPrefs()
    setPrefs({ palette: 'crust', mode: 'dark' })
    expect(document.documentElement.dataset.palette).toBe('crust')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('leaves the theme to the system when set to automatic', async () => {
    const { setPrefs } = await loadPrefs()
    setPrefs({ mode: 'dark' })
    expect(document.documentElement.dataset.theme).toBe('dark')
    setPrefs({ mode: 'system' })
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })
})
