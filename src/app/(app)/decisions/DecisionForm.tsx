'use client'

import { useActionState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { createDecision } from './actions'

export function NewDecisionForm() {
  const [state, action, pending] = useActionState(createDecision, undefined)
  return (
    <form action={action} className="space-y-3" key={state?.ok ? 'done' : 'open'}>
      <label className="block text-sm font-medium">Title
        <input name="title" required className={inputClass} />
      </label>
      <label className="block text-sm font-medium">The decision
        <textarea name="decision" rows={3} required className={inputClass} />
      </label>
      <label className="block text-sm font-medium">Why
        <textarea name="rationale" rows={2} className={inputClass} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">Decided by
          <input name="decided_by" defaultValue="Executive Team" className={inputClass} />
        </label>
        <label className="block text-sm font-medium">Date
          <input name="decided_on" type="date" className={inputClass} />
        </label>
      </div>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : 'Record decision'}</button>
    </form>
  )
}
