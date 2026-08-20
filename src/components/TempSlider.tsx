import type { ReactNode } from 'react'
import { Slider } from './Controls'
import { usePrefs } from '../hooks'
import { cToF, fToC, formatTemp } from '../lib/temperature'

/**
 * A temperature slider that stores Celsius but shows whichever unit the baker
 * picked. Kept in one place because it was previously duplicated on the Starter
 * and Plan pages, each with its own copy of the conversion and its own idea of
 * the current unit.
 *
 * The stored value stays Celsius no matter what is displayed — converting for
 * display only means the fermentation maths never has to care about units.
 */
export function TempSlider({
  label,
  tempC,
  onChange,
  hint,
}: {
  label: string
  tempC: number
  onChange: (tempC: number) => void
  hint?: ReactNode
}) {
  const { tempUnit } = usePrefs()
  const isC = tempUnit === 'C'

  return (
    <Slider
      label={label}
      value={isC ? Math.round(tempC) : Math.round(cToF(tempC))}
      min={isC ? 14 : 57}
      max={isC ? 34 : 93}
      step={1}
      display={formatTemp(tempC, tempUnit)}
      onChange={(v) => onChange(isC ? v : fToC(v))}
      hint={hint}
    />
  )
}
