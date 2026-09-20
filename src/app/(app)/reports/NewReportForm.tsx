'use client'

import { useActionState, useState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { createReport } from './actions'

export function NewReportForm({
  canDepartment, departments, defaultDepartment, start, end,
}: {
  canDepartment: boolean
  departments: { id: string; label: string }[]
  defaultDepartment: string
  start: string
  end: string
}) {
  const [state, action, pending] = useActionState(createReport, undefined)
  const [kind, setKind] = useState('personal')
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {canDepartment && (
          <label className="block text-sm font-medium">Report type
            <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass}>
              <option value="personal">My own report</option>
              <option value="department">Department report</option>
            </select>
          </label>
        )}
        {kind === 'department' && (
          <label className="block text-sm font-medium">Department
            <select name="department_id" defaultValue={defaultDepartment} required className={inputClass}>
              <option value="" disabled>Choose…</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>
        )}
        <label className="block text-sm font-medium">Period from
          <input name="period_start" type="date" defaultValue={start} required className={inputClass} />
        </label>
        <label className="block text-sm font-medium">Period to
          <input name="period_end" type="date" defaultValue={end} required className={inputClass} />
        </label>
      </div>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Opening…' : 'Start or continue report'}</button>
    </form>
  )
}
