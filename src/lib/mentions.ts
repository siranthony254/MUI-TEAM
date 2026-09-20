export interface MentionTarget {
  label: string        // what follows the @, e.g. "Anthony Munene" or "Executive"
  ids: string[]        // member ids that a mention of this label notifies
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Turns "@Anthony Munene please check" into member ids. Longest label wins so
 * "@Anna Maria" is not mistaken for "@Anna". A mention must sit at a word
 * boundary so an email address never counts.
 */
export function extractMentions(body: string, targets: MentionTarget[]): string[] {
  const found = new Set<string>()
  const lower = body.toLowerCase()
  const consumed: [number, number][] = []   // spans already claimed by a longer label
  for (const t of [...targets].sort((a, b) => b.label.length - a.label.length)) {
    const needle = `@${t.label.toLowerCase()}`
    let from = 0
    for (;;) {
      const i = lower.indexOf(needle, from)
      if (i === -1) break
      const end = i + needle.length
      from = end
      const before = i === 0 ? ' ' : lower[i - 1]
      const after = lower[end] ?? ' '
      const overlaps = consumed.some(([s, e]) => i < e && end > s)
      if (!overlaps && /[\s(\[{"'>]/.test(before) && !/[\p{L}\p{N}_]/u.test(after)) {
        t.ids.forEach((id) => found.add(id))
        consumed.push([i, end])
      }
    }
  }
  return [...found]
}

/** Splits a message into plain and @mention segments for rendering. */
export function splitMentions(body: string, labels: string[]): { text: string; mention: boolean }[] {
  const sorted = [...labels].sort((a, b) => b.length - a.length).map(escapeRegExp)
  if (sorted.length === 0) return [{ text: body, mention: false }]
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])(@(?:${sorted.join('|')}))(?![\\p{L}\\p{N}_])`, 'giu')
  const out: { text: string; mention: boolean }[] = []
  let last = 0
  for (const m of body.matchAll(re)) {
    if (m.index > last) out.push({ text: body.slice(last, m.index), mention: false })
    out.push({ text: m[0], mention: true })
    last = m.index + m[0].length
  }
  if (last < body.length) out.push({ text: body.slice(last), mention: false })
  return out
}
