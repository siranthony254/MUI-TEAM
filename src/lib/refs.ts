export interface RefItem { type: 'task' | 'project'; id: string; label: string }

/** Splits text into plain parts and "#label" reference parts (longest label wins). */
export function splitRefs(text: string, refs: RefItem[]): { text: string; ref?: RefItem }[] {
  if (refs.length === 0) return [{ text }]
  const sorted = [...refs].sort((a, b) => b.label.length - a.label.length)
  const out: { text: string; ref?: RefItem }[] = []
  let rest = text
  while (rest.length > 0) {
    let best: { idx: number; ref: RefItem } | null = null
    for (const r of sorted) {
      const idx = rest.indexOf(`#${r.label}`)
      if (idx !== -1 && (best === null || idx < best.idx)) best = { idx, ref: r }
    }
    if (!best) { out.push({ text: rest }); break }
    if (best.idx > 0) out.push({ text: rest.slice(0, best.idx) })
    out.push({ text: `#${best.ref.label}`, ref: best.ref })
    rest = rest.slice(best.idx + best.ref.label.length + 1)
  }
  return out
}

export const hrefOfRef = (r: RefItem) => (r.type === 'task' ? `/tasks/${r.id}` : `/projects/${r.id}`)
