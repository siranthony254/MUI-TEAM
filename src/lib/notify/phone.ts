/** Kenyan numbers -> E.164 (+2547XXXXXXXX). Returns null if it can't be made valid. */
export function normalizePhone(raw: string | null): string | null {
  if (!raw) return null
  const d = raw.replace(/[^\d+]/g, '')
  if (/^\+\d{10,15}$/.test(d)) return d
  if (/^0[17]\d{8}$/.test(d)) return `+254${d.slice(1)}`
  if (/^254[17]\d{8}$/.test(d)) return `+${d}`
  return null
}
