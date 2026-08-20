/** Time and duration formatting, all locale-aware where it matters. */

const time = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

const dayTime = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

const day = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
})

export const fmtTime = (ms: number): string => time.format(ms)
export const fmtDayTime = (ms: number): string => dayTime.format(ms)
export const fmtDay = (ms: number): string => day.format(ms)

/** "Today" / "Tomorrow" / "Sat 22 Aug", for schedule day dividers. */
export function fmtDayHeading(ms: number, now = Date.now()): string {
  const d = startOfDay(ms)
  const today = startOfDay(now)
  const diff = Math.round((d - today) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return fmtDay(ms)
}

export function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** "4h 30m", "45m", "2d 6h" — for durations shown as a length of time. */
export function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`
  const d = Math.floor(h / 24)
  const hRem = h % 24
  return hRem ? `${d}d ${hRem}h` : `${d}d`
}

/** "3:45:12" / "45:12" — for a live countdown. */
export function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** "in 25m" / "12m ago" / "now". */
export function fmtRelative(target: number, now = Date.now()): string {
  const deltaMin = Math.round((target - now) / 60_000)
  if (Math.abs(deltaMin) < 1) return 'now'
  return deltaMin > 0
    ? `in ${fmtDuration(deltaMin)}`
    : `${fmtDuration(-deltaMin)} ago`
}

/** Value for an `<input type="datetime-local">`, which wants local time. */
export function toDatetimeLocal(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`
}

export function fromDatetimeLocal(value: string): number | null {
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}
