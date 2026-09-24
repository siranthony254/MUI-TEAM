'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { buttonClass, inputClass } from '@/components/ui'
import type { DocTemplate, Field } from '@/lib/documents/templates'

function FieldInput({ field, value, onChange }: { field: Field; value: string; onChange: (v: string) => void }) {
  const common = { id: field.key, value, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(e.target.value) }
  return (
    <label htmlFor={field.key} className="block text-sm font-medium">
      {field.label}{field.required && <span className="text-red-600"> *</span>}
      {field.hint && <span className="mt-0.5 block text-xs font-normal text-neutral-500 dark:text-neutral-400">{field.hint}</span>}
      {field.type === 'textarea' ? (
        <textarea {...common} rows={field.rows ?? 3} placeholder={field.placeholder} className={`${inputClass} mt-1`} />
      ) : field.type === 'select' ? (
        <select {...common} className={`${inputClass} mt-1`}>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input {...common} type={field.type === 'date' ? 'date' : 'text'} placeholder={field.placeholder} className={`${inputClass} mt-1`} />
      )}
    </label>
  )
}

export function TemplateFillForm({ template }: { template: DocTemplate }) {
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(template.fields.map((f) => [f.key, f.default ?? ''])),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (key: string, v: string) => setValues((cur) => ({ ...cur, [key]: v }))

  async function download() {
    const missing = template.fields.find((f) => f.required && !values[f.key]?.trim())
    if (missing) { setError(`Fill in "${missing.label}" first.`); return }
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/documents/${template.slug}/pdf`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Could not generate the PDF.')
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${template.slug}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = fileName; a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {template.fields.map((f) => <FieldInput key={f.key} field={f} value={values[f.key] ?? ''} onChange={(v) => set(f.key, v)} />)}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button onClick={download} disabled={busy} className={`${buttonClass} inline-flex items-center gap-2`}>
        <Download size={16} aria-hidden /> {busy ? 'Preparing PDF…' : 'Download filled PDF'}
      </button>
    </div>
  )
}
