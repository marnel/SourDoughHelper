import type { ReactNode } from 'react'
import { Slider } from './Controls'
import { usePrefs } from '../hooks'
import { setPrefs } from '../lib/prefs'
import { cToF, fToC, formatTemp, tempAdvice } from '../lib/temperature'

/**
 * The kitchen temperature slider.
 *
 * Reads and writes the single shared value directly, so it can be dropped on
 * any page and every instance stays in step. Both the value and the unit were
 * previously duplicated per page, which let the Starter tab and the planner
 * quote different times for the same levain.
 *
 * The stored value is always Celsius; converting only for display keeps the
 * fermentation maths free of units.
 */
export function TempSlider({
  label = 'Kitchen temperature',
  hint,
  showAdvice = true,
}: {
  label?: string
  hint?: ReactNode
  /** The plain-language read on what this temperature will do. */
  showAdvice?: boolean
}) {
  const { tempC, tempUnit } = usePrefs()
  const isC = tempUnit === 'C'
  const advice = tempAdvice(tempC)

  return (
    <>
      <Slider
        label={label}
        value={isC ? Math.round(tempC) : Math.round(cToF(tempC))}
        min={isC ? 14 : 57}
        max={isC ? 34 : 93}
        step={1}
        display={formatTemp(tempC, tempUnit)}
        onChange={(v) => setPrefs({ tempC: isC ? v : fToC(v) })}
        hint={hint}
      />
      {/* Owned here so every page presents the reading identically. */}
      {showAdvice ? (
        <p className="advice">
          <strong>{advice.label}.</strong> {advice.note}
        </p>
      ) : null}
    </>
  )
}
