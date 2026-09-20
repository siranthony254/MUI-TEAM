/** The team works in Kenya time (UTC+3, no daylight saving). All display and parsing goes through here. */
export const TZ = 'Africa/Nairobi'

/** "2026-09-25T17:00" from a <input type="datetime-local"> is Nairobi wall-clock time. */
export function localInputToIso(value: string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(`${value.length === 16 ? `${value}:00` : value}+03:00`)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-KE', {
    timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })
}

export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '—'
  // date-only strings (YYYY-MM-DD) are already calendar days
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00+03:00`) : new Date(iso)
  return d.toLocaleDateString('en-KE', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' })
}

/** YYYY-MM-DD in Nairobi for a Date or ISO string. */
export function dayKey(d: Date | string = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d))
}

export function nairobiHour(d: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hour12: false }).format(d)) % 24
}

/** First and last day (YYYY-MM-DD) of the Nairobi month containing `d`. */
export function monthRange(d: Date = new Date()): { start: string; end: string; label: string } {
  const [y, m] = dayKey(d).split('-').map(Number)
  const start = `${y}-${String(m).padStart(2, '0')}-01`
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const end = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  const label = new Date(`${start}T12:00:00+03:00`).toLocaleDateString('en-KE', { timeZone: TZ, month: 'long', year: 'numeric' })
  return { start, end, label }
}

/** Compact chat timestamp: "14:05" today, otherwise "23 Sep, 14:05". */
export function fmtChatTime(iso: string): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-KE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
  if (dayKey(d) === dayKey(new Date())) return time
  return `${d.toLocaleDateString('en-KE', { timeZone: TZ, day: 'numeric', month: 'short' })}, ${time}`
}

/** Month grid helpers, all in Nairobi calendar terms. */
export function parseMonthParam(param: string | undefined): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(param ?? '')
  if (m && +m[2] >= 1 && +m[2] <= 12) return { year: +m[1], month: +m[2] }
  const [y, mo] = dayKey().split('-').map(Number)
  return { year: y, month: mo }
}
export const monthParam = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`
export function shiftMonth(year: number, month: number, by: number) {
  const d = new Date(Date.UTC(year, month - 1 + by, 1))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}
