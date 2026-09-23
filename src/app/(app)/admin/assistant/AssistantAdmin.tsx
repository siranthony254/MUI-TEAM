'use client'

import { useActionState } from 'react'
import { buttonClass, inputClass, secondaryButtonClass } from '@/components/ui'
import { ManagePanel, ConfirmButton } from '@/components/ConfirmButton'
import { useFormToast } from '@/components/Toaster'
import { saveKnowledge, deleteKnowledge, resolveQuestion } from '../../assistant-actions'

interface Option { id: string; name: string }

export function KnowledgeForm({
  id, departmentId, topic, answer, departments, canOrgWide,
}: { id?: string; departmentId?: string | null; topic?: string; answer?: string; departments: Option[]; canOrgWide: boolean }) {
  const [state, action, pending] = useActionState(saveKnowledge, undefined)
  useFormToast(state)
  const body = (
    <form action={action} className="space-y-3">
      {id && <input type="hidden" name="id" value={id} />}
      <label className="block text-sm font-medium">Applies to
        <select name="department_id" defaultValue={departmentId ?? ''} className={inputClass}>
          {canOrgWide && <option value="">Everyone (organisation-wide)</option>}
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">Topic / question
        <input name="topic" required defaultValue={topic} placeholder="e.g. How do we credit guests in show notes?" className={inputClass} />
      </label>
      <label className="block text-sm font-medium">Answer
        <textarea name="answer" required rows={3} defaultValue={answer} className={inputClass} />
      </label>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <div className="flex items-center gap-3">
        <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : id ? 'Save' : 'Add'}</button>
        {id && (
          <form action={deleteKnowledge}>
            <input type="hidden" name="id" value={id} />
            <ConfirmButton message="Remove this from Ask MUI's knowledge?" className="text-sm text-red-600 hover:underline">Delete</ConfirmButton>
          </form>
        )}
      </div>
    </form>
  )
  return id ? <ManagePanel label="Edit">{body}</ManagePanel> : body
}

export function QuestionForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(resolveQuestion, undefined)
  useFormToast(state)
  return (
    <form action={action} className="mt-3 space-y-2 border-t border-neutral-200 pt-3 dark:border-white/10">
      <input type="hidden" name="id" value={id} />
      <textarea name="answer" required rows={2} placeholder="Your answer…" className={inputClass + ' mt-0'} />
      <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
        <input type="checkbox" name="add_to_knowledge" defaultChecked /> Also add this to what Ask MUI knows
      </label>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className={secondaryButtonClass}>{pending ? 'Saving…' : 'Answer'}</button>
    </form>
  )
}
