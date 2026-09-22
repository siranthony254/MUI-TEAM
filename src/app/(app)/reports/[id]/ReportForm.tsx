'use client'

import { useActionState } from 'react'
import { buttonClass, inputClass, secondaryButtonClass } from '@/components/ui'
import type { Report, ReportSection } from '@/lib/types'
import { saveReport } from '../actions'
import { useFormToast } from '@/components/Toaster'

// A handful of reports were started before templates existed; they still use the five fixed columns.
const LEGACY_FIELDS: [keyof Report, string, string][] = [
  ['activities', 'Activities', 'What did you and your team work on?'],
  ['completed', 'Completed', 'What was finished or delivered?'],
  ['challenges', 'Challenges', 'What got in the way?'],
  ['metrics', 'Metrics', 'Any numbers worth recording (only real ones)'],
  ['recommendations', 'Recommendations', 'What should change or be decided?'],
]

export function ReportForm({ report }: { report: Report }) {
  const [state, action, pending] = useActionState(saveReport, undefined)
  useFormToast(state)
  const sections = report.sections ?? []
  const usingTemplate = sections.length > 0

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={report.id} />
      {usingTemplate
        ? sections.map((s: ReportSection) => (
            <label key={s.key} className="block text-sm font-medium">{s.label}
              {s.hint && <span className="mt-0.5 block text-xs font-normal text-neutral-500 dark:text-neutral-400">{s.hint}</span>}
              <textarea name={`section_${s.key}`} rows={4} defaultValue={s.value ?? ''} className={`${inputClass} mt-1`} />
            </label>
          ))
        : LEGACY_FIELDS.map(([key, label, hint]) => (
            <label key={key} className="block text-sm font-medium">{label}
              <textarea name={key} rows={4} placeholder={hint} defaultValue={(report[key] as string | null) ?? ''} className={inputClass} />
            </label>
          ))}
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <div className="flex flex-wrap gap-2">
        <button name="intent" value="draft" disabled={pending} className={secondaryButtonClass}>
          Save draft
        </button>
        <button name="intent" value="submit" disabled={pending} className={buttonClass}
          onClick={(e) => { if (!confirm('Submit this report? You won’t be able to edit it afterwards.')) e.preventDefault() }}>
          Submit report
        </button>
      </div>
    </form>
  )
}
