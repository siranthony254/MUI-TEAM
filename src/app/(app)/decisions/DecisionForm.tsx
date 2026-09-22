'use client'

import { useActionState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { createDecision } from './actions'
import { useFormToast } from '@/components/Toaster'

interface Option { id: string; label: string }

export function NewDecisionForm({ people, projects }: { people: Option[]; projects: Option[] }) {
  const [state, action, pending] = useActionState(createDecision, undefined)
  useFormToast(state)
  return (
    <form action={action} className="space-y-3" key={state?.ok ? 'done' : 'open'}>
      <label className="block text-sm font-medium">Decision
        <input name="title" required placeholder="A short headline" className={inputClass} />
      </label>
      <label className="block text-sm font-medium">What was decided
        <textarea name="decision" rows={3} required className={inputClass} />
      </label>
      <label className="block text-sm font-medium">Background — why
        <textarea name="rationale" rows={2} className={inputClass} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">Decision makers
          <input name="decided_by" defaultValue="Executive Team" className={inputClass} />
        </label>
        <label className="block text-sm font-medium">Date
          <input name="decided_on" type="date" className={inputClass} />
        </label>
        <label className="block text-sm font-medium">Implementation owner
          <select name="implementation_owner_id" defaultValue="" className={inputClass}>
            <option value="">Not assigned</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Related project
          <select name="project_id" defaultValue="" className={inputClass}>
            <option value="">None</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs text-neutral-500">Once recorded, you can attach supporting documents to it from the register.</p>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : 'Record decision'}</button>
    </form>
  )
}
