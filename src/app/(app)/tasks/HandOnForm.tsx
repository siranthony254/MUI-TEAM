'use client'

import { useActionState } from 'react'
import { buttonClass, inputClass } from '@/components/ui'
import { ChannelPicker } from './TaskForm'
import { reassignTask } from './actions'
import { useFormToast } from '@/components/Toaster'

interface Option { id: string; label: string }

/** Delegate (the holder passes it on) or reassign (the assigner moves it): same form, honest wording. */
export function HandOnForm({
  taskId, people, delegating, currentTitle,
}: { taskId: string; people: Option[]; delegating: boolean; currentTitle: string }) {
  const [state, action, pending] = useActionState(reassignTask, undefined)
  useFormToast(state)
  const verb = delegating ? 'Delegate' : 'Reassign'
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="task_id" value={taskId} />
      <p className="text-sm text-neutral-600">Task: <strong>{currentTitle}</strong></p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">{delegating ? 'Delegate to' : 'Reassign to'}
          <select name="assignee_id" required defaultValue="" className={inputClass}>
            <option value="" disabled>Choose a person</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">New deadline (optional)
          <input name="due_at" type="datetime-local" className={inputClass} />
        </label>
      </div>
      {delegating && (
        <label className="block text-sm font-medium">Instructions
          <textarea name="note" rows={3} className={inputClass} placeholder="What do they need to know?" />
        </label>
      )}
      <ChannelPicker />
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-green-700">{state.ok}</p>}
      <button disabled={pending} className={buttonClass}>{pending ? 'Saving…' : `Confirm ${verb.toLowerCase()}`}</button>
    </form>
  )
}
