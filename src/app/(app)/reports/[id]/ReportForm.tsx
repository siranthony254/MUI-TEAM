'use client'

import { useActionState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import type { Report } from '@/lib/types'
import { saveReport } from '../actions'

const FIELDS: [keyof Report, string, string][] = [
  ['activities', 'Activities', 'What did you and your team work on?'],
  ['completed', 'Completed', 'What was finished or delivered?'],
  ['challenges', 'Challenges', 'What got in the way?'],
  ['metrics', 'Metrics', 'Any numbers worth recording (only real ones)'],
  ['recommendations', 'Recommendations', 'What should change or be decided?'],
]

export function ReportForm({ report }: { report: Report }) {
  const [state, action, pending] = useActionState(saveReport, undefined)
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={report.id} />
      {FIELDS.map(([key, label, hint]) => (
        <label key={key} className="block text-sm font-medium">{label}
          <textarea name={key} rows={4} placeholder={hint} defaultValue={(report[key] as string | null) ?? ''} className={inputClass} />
        </label>
      ))}
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <div className="flex flex-wrap gap-2">
        <button name="intent" value="draft" disabled={pending}
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-60">
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
