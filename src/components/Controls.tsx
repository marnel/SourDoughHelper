import type { ReactNode } from 'react'
import { useId } from 'react'

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  /** Rendered to the right of the label, e.g. "75%" or "5h". */
  display: string
  hint?: ReactNode
  onChange: (value: number) => void
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  hint,
  onChange,
}: SliderProps) {
  const id = useId()
  return (
    <div className="field">
      <label className="field-head" htmlFor={id}>
        <span>{label}</span>
        <output className="field-value">{display}</output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  )
}

interface NumberFieldProps {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  suffix?: string
  hint?: ReactNode
  onChange: (value: number) => void
}

export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  hint,
  onChange,
}: NumberFieldProps) {
  const id = useId()
  return (
    <div className="field">
      <label className="field-head" htmlFor={id}>
        <span>{label}</span>
      </label>
      <div className="number-row">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) onChange(n)
          }}
        />
        {suffix ? <span className="suffix">{suffix}</span> : null}
      </div>
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  )
}

interface SegmentedProps<T extends string> {
  label?: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div className="field">
      {label ? <div className="field-head">{label}</div> : null}
      <div className="segmented" role="tablist">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={o.value === value}
            className={o.value === value ? 'seg on' : 'seg'}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

interface StepperProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format?: (v: number) => string
  onChange: (value: number) => void
}

export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
}: StepperProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  return (
    <div className="field">
      <div className="field-head">
        <span>{label}</span>
      </div>
      <div className="stepper">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - step))}
        >
          −
        </button>
        <span className="stepper-value">
          {format ? format(value) : value}
        </span>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange(clamp(value + step))}
        >
          +
        </button>
      </div>
    </div>
  )
}

export function Card({
  title,
  subtitle,
  children,
  tone,
}: {
  title?: string
  subtitle?: string
  children: ReactNode
  tone?: 'warn' | 'accent'
}) {
  return (
    <section className={tone ? `card ${tone}` : 'card'}>
      {title ? (
        <header className="card-head">
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  )
}

export function Details({
  summary,
  children,
}: {
  summary: string
  children: ReactNode
}) {
  return (
    <details className="disclose">
      <summary>{summary}</summary>
      <div className="disclose-body">{children}</div>
    </details>
  )
}
