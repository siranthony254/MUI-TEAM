'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { buttonClass, inputClass, secondaryButtonClass } from '@/components/ui'
import { useFormToast } from '@/components/Toaster'
import { saveTemplate, type TemplateState } from '@/app/(app)/admin/departments/template-actions'

interface Row { label: string; hint: string }

/** Turns a label into a stable, url-safe key; numbers duplicates so two similarly-named sections never collide. */
function keysFor(rows: Row[]): string[] {
  const seen = new Map<string, number>()
  return rows.map((r) => {
    const base = r.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'section'
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}_${n}`
  })
}

export function TemplateEditor({
  departmentId, name, initial,
}: { departmentId: string | null; name: string; initial: { label: string; hint?: string | null }[] }) {
  const [rows, setRows] = useState<Row[]>(
    initial.length > 0 ? initial.map((s) => ({ label: s.label, hint: s.hint ?? '' })) : [{ label: '', hint: '' }],
  )
  const [state, action, pending] = useActionState(saveTemplate, undefined as TemplateState | undefined)
  useFormToast(state)

  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)))
  const move = (i: number, dir: -1 | 1) => setRows((r) => {
    const j = i + dir
    if (j < 0 || j >= r.length) return r
    const copy = [...r]
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    return copy
  })

  const cleanRows = rows.filter((r) => r.label.trim())
  const keys = keysFor(cleanRows)
  const payload = JSON.stringify(cleanRows.map((r, i) => ({ key: keys[i], label: r.label.trim(), hint: r.hint.trim() || null })))

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="department_id" value={departmentId ?? ''} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="sections" value={payload} />

      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="rounded-lg border border-neutral-200 p-3 dark:border-white/10">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  value={row.label} onChange={(e) => update(i, { label: e.target.value })}
                  placeholder="Section heading, e.g. “Audience growth”" className={inputClass + ' mt-0'} />
                <textarea
                  value={row.hint} onChange={(e) => update(i, { hint: e.target.value })} rows={2}
                  placeholder="Guidance shown under the heading — what should go here, and what “good” looks like."
                  className={inputClass + ' mt-0 text-xs'} />
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"
                  className="rounded p-1 text-neutral-400 hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-white/10"><ArrowUp size={14} /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down"
                  className="rounded p-1 text-neutral-400 hover:bg-neutral-100 disabled:opacity-30 dark:hover:bg-white/10"><ArrowDown size={14} /></button>
                <button type="button" onClick={() => setRows((r) => r.filter((_, j) => j !== i))} disabled={rows.length === 1} aria-label="Remove section"
                  className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:hover:bg-red-500/10"><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={() => setRows((r) => [...r, { label: '', hint: '' }])}
        className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:underline dark:text-amber-400">
        <Plus size={14} aria-hidden /> Add a section
      </button>

      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}

      <div className="flex gap-2 border-t border-neutral-200 pt-4 dark:border-white/10">
        <button disabled={pending || cleanRows.length === 0} className={buttonClass}>{pending ? 'Saving…' : 'Save template'}</button>
        <Link href="/admin/departments" className={`${secondaryButtonClass} inline-flex items-center`}>Back</Link>
      </div>
    </form>
  )
}
