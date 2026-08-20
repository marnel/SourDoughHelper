import { useEffect, useRef } from 'react'
import { Segmented } from './Controls'
import { usePrefs } from '../hooks'
import { setPrefs } from '../lib/prefs'
import { MODE_LABELS, PALETTES, type ThemeMode } from '../lib/theme'
import { REFERENCE_C, formatTemp, type TempUnit } from '../lib/temperature'

/**
 * One swatch per palette, rendered in that palette's own colours by scoping
 * `data-palette` and `data-theme` to the element. No colour values in JS.
 */
function Swatch({
  palette,
  mode,
}: {
  palette: string
  mode: 'light' | 'dark'
}) {
  return (
    <span className="swatch" data-palette={palette} data-theme={mode} aria-hidden="true">
      <span className="s-surface" />
      <span className="s-accent" />
      <span className="s-ink" />
    </span>
  )
}

export function SettingsSheet({
  open,
  onClose,
  resolvedMode,
}: {
  open: boolean
  onClose: () => void
  resolvedMode: 'light' | 'dark'
}) {
  const prefs = usePrefs()
  const ref = useRef<HTMLDialogElement>(null)

  // Drive the native dialog from the `open` prop so React stays the source of
  // truth, while showModal() still gives us Escape and focus trapping.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="settings-title"
      onClose={onClose}
      onClick={(e) => {
        // Clicking the backdrop (outside the dialog's own box) dismisses.
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="sheet-inner">
        <div className="sheet-head">
          <h2 id="settings-title">Settings</h2>
          <button type="button" className="ghost" onClick={onClose}>
            Done
          </button>
        </div>

        <div className="sheet-group">
          <h3>Colour</h3>
          <div className="palette-list" role="radiogroup" aria-label="Colour palette">
            {PALETTES.map((p) => {
              const on = p.id === prefs.palette
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={on ? 'palette-option on' : 'palette-option'}
                  onClick={() => setPrefs({ palette: p.id })}
                >
                  <Swatch palette={p.id} mode={resolvedMode} />
                  <span className="palette-text">
                    <strong>{p.name}</strong>
                    <span>{p.description}</span>
                  </span>
                  {on ? (
                    <span className="palette-check" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>

        <div className="sheet-group">
          <h3>Appearance</h3>
          <Segmented
            value={prefs.mode}
            onChange={(mode: ThemeMode) => setPrefs({ mode })}
            options={[
              { value: 'system', label: MODE_LABELS.system },
              { value: 'light', label: MODE_LABELS.light },
              { value: 'dark', label: MODE_LABELS.dark },
            ]}
          />
          <p className="sheet-note">
            {prefs.mode === 'system'
              ? `Following your device, which is currently ${resolvedMode}.`
              : `Always ${prefs.mode}, whatever your device is set to.`}
          </p>
        </div>

        <div className="sheet-group">
          <h3>Temperature</h3>
          <Segmented
            value={prefs.tempUnit}
            onChange={(tempUnit: TempUnit) => setPrefs({ tempUnit })}
            options={[
              { value: 'F', label: 'Fahrenheit' },
              { value: 'C', label: 'Celsius' },
            ]}
          />
          <p className="sheet-note">
            Used everywhere temperatures appear. All timings are authored at{' '}
            {formatTemp(REFERENCE_C, prefs.tempUnit)} and scaled from there.
          </p>
        </div>
      </div>
    </dialog>
  )
}
